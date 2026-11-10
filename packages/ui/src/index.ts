// @spektrum/ui — design system components + SVG icon registry.
// The icon registry lands in Task 3 (spec §5.8); this barrel keeps the package
// resolvable and typecheckable now.
export const UI_PACKAGE = "@spektrum/ui" as const;

export * from "./primitives/button";
export * from "./primitives/input";
export * from "./primitives/dropdown-menu";
export * from "./primitives/dialog";
export * from "./lib/cn";