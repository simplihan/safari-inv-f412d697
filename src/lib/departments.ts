export const DEPARTMENTS = ["Inventory", "Purchase", "Admin", "Customer Service"] as const;
export type Department = (typeof DEPARTMENTS)[number];