import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profile")({ component: Profile });

function Profile() {
  const { profile, refresh } = useAuth();
  const [mobile, setMobile] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [pwd, setPwd] = useState("");

  useEffect(() => {
    if (profile) { setMobile(profile.mobile ?? ""); setProfileImage(profile.profile_image ?? ""); }
  }, [profile]);

  if (!profile) return null;

  const saveInfo = async () => {
    const { error } = await supabase.from("profiles").update({ mobile, profile_image: profileImage }).eq("id", profile.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("Profile updated"); refresh();
  };
  const changePwd = async () => {
    if (pwd.length < 6) return toast.error("Min 6 characters");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(friendlyError(error));
    toast.success("Password changed"); setPwd("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      <Card className="glass">
        <CardHeader><CardTitle>Account info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profileImage} />
              <AvatarFallback className="gradient-primary text-primary-foreground">
                {profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Label>Profile image URL</Label>
              <Input value={profileImage} onChange={(e) => setProfileImage(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Full name</Label><Input value={profile.full_name} disabled /></div>
            <div><Label>SGC ID</Label><Input value={profile.sgc_id ?? ""} disabled /></div>
            <div><Label>Email</Label><Input value={profile.email} disabled /></div>
            <div><Label>Department</Label><Input value={profile.department ?? ""} disabled /></div>
            <div className="col-span-2"><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          </div>
          <Button onClick={saveInfo} className="gradient-primary text-primary-foreground border-0">Save changes</Button>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input type="password" placeholder="New password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <Button onClick={changePwd} variant="outline">Update password</Button>
        </CardContent>
      </Card>
    </div>
  );
}