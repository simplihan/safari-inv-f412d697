"""Run after `lovable auth-session --json --self`; requires an admin session.

Verifies the real switch, public page, direct signup guard and anonymous writes.
Restores the original registration setting even if an assertion fails.
"""
import asyncio
from pathlib import Path
from time import time_ns
from playwright.async_api import async_playwright
from lovable_playwright_defaults import signed_in_context

APP = "http://localhost:8080"
SHOTS = Path("/tmp/browser/registration-switch")
CLIENT = "/src/integrations/supabase/client.ts"


async def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        admin = await signed_in_context(browser)
        page = await admin.new_page()
        await page.goto(APP + "/app/pending", wait_until="domcontentloaded")
        switch = page.get_by_role("switch", name="New user registration")
        await switch.wait_for()
        await page.wait_for_function("document.querySelector('[role=switch]')?.disabled === false")
        original = await switch.is_checked()
        public = await browser.new_context()
        visitor = await public.new_page()

        async def set_status(value):
            if await switch.is_checked() != value:
                await switch.click()
            await page.wait_for_function(
                "value => { const s = document.querySelector('[role=switch]'); return s && !s.disabled && (s.getAttribute('aria-checked') === 'true') === value; }",
                arg=value,
            )

        try:
            await set_status(True)
            await page.reload(wait_until="domcontentloaded")
            await switch.wait_for()
            await page.wait_for_function("document.querySelector('[role=switch]')?.disabled === false")
            assert await switch.is_checked(), "Admin ON did not persist"
            await visitor.goto(APP + "/register", wait_until="domcontentloaded")
            await visitor.get_by_role("button", name="Submit request").wait_for()
            await visitor.screenshot(path=str(SHOTS / "on.png"))
            print("PASS: admin ON persists and public registration form appears")

            await set_status(False)
            await visitor.reload(wait_until="domcontentloaded")
            await visitor.get_by_text("New access requests are currently paused. Please contact your administrator.").wait_for()
            assert await visitor.get_by_role("button", name="Submit request").count() == 0
            await page.screenshot(path=str(SHOTS / "admin-off.png"))
            await visitor.screenshot(path=str(SHOTS / "off.png"))
            print("PASS: admin OFF hides the registration form")

            outcome = await visitor.evaluate("""async ({client, email}) => {
              const {supabase} = await import(client);
              const signup = await supabase.auth.signUp({email, password: 'PausedRegistrationProbe2026!'});
              const write = await supabase.rpc('set_registration_enabled', {_enabled: true});
              const status = await supabase.rpc('get_registration_enabled');
              return {signupBlocked: !!signup.error, anonymousBlocked: !!write.error, enabled: status.data};
            }""", {"client": CLIENT, "email": f"paused-registration-probe-{time_ns()}@example.com"})
            assert outcome["signupBlocked"], "OFF allowed a direct signup"
            assert outcome["anonymousBlocked"], "Anonymous caller changed registration setting"
            assert outcome["enabled"] is False, "Blocked anonymous write changed setting"
            print("PASS: direct signup and anonymous setting writes are blocked")

            await page.reload(wait_until="domcontentloaded")
            await switch.wait_for()
            await page.wait_for_function("document.querySelector('[role=switch]')?.disabled === false")
            assert not await switch.is_checked(), "OFF did not persist or existing admin lost access"
            print("PASS: OFF persists and existing admin remains signed in")
        finally:
            result = await page.evaluate("""async ({client, enabled}) => {
              const {supabase} = await import(client);
              const {data, error} = await supabase.rpc('set_registration_enabled', {_enabled: enabled});
              return {ok: !error && data === enabled};
            }""", {"client": CLIENT, "enabled": original})
            assert result["ok"], "Could not restore original registration setting"
            print("PASS: original registration setting restored")
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())