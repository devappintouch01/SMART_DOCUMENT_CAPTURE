// Page sizes of the result list. Lives outside the client component that draws
// the controls, because the server page needs the list too.
export const PAGE_SIZES = [
  { value: "10", label: "10" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "ทั้งหมด" },
];

export const DEFAULT_PAGE_SIZE = "10";

// The size named in the URL if it is one we offer, else the default.
export function pageSizeFromParam(param: string | undefined): string {
  return PAGE_SIZES.some((s) => s.value === param) ? (param as string) : DEFAULT_PAGE_SIZE;
}
