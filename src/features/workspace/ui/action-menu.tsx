import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Adapted from the MIT-licensed shadcn/ui Radix Dropdown Menu registry.
export function ActionMenu({
  label,
  pinned,
  togglePin,
  settings,
}: {
  label: string;
  pinned: boolean;
  togglePin: () => void;
  settings?: () => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="action-menu-trigger"
        aria-label={`More actions for ${label}`}
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-slot="dropdown-menu-content"
          className="action-menu-content"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item className="action-menu-item" onSelect={togglePin}>
            {pinned ? "Remove from Favorites" : "Add to Favorites"}
          </DropdownMenu.Item>
          {settings && (
            <DropdownMenu.Item className="action-menu-item" onSelect={settings}>
              Feature settings
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
