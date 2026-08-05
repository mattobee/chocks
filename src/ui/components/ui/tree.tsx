"use client"

/* eslint-disable @typescript-eslint/no-explicit-any -- generic tree item data flows through
   context untyped here; call sites narrow it back to their own item type. */

import { createContext, useContext } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { ItemInstance } from "@headless-tree/core"
import { ChevronDownIcon, MinusIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type ToggleIconType = "chevron" | "plus-minus"

interface TreeContextValue<T = any> {
  indent: number
  currentItem?: ItemInstance<T>
  tree?: unknown
  toggleIconType?: ToggleIconType
}

const TreeContext = createContext<TreeContextValue>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
  toggleIconType: "chevron",
})

function useTreeContext<T = any>() {
  return useContext(TreeContext) as TreeContextValue<T>
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
  tree?: { getContainerProps?: (label?: string) => Record<string, unknown> }
  toggleIconType?: ToggleIconType
}

function Tree({ indent = 20, tree, className, style, toggleIconType = "chevron", ...props }: TreeProps) {
  const containerProps =
    tree && typeof tree.getContainerProps === "function" ? tree.getContainerProps() : {}
  // Headless Tree's own container props carry a `style` too (position: relative, for the
  // drag line's absolute positioning) — spreading the two prop objects in either order
  // would drop one `style` entirely rather than merging them, since a shallow spread
  // replaces the whole key.
  const { style: containerStyle, ...otherContainerProps } = containerProps as {
    style?: React.CSSProperties
  }
  const mergedProps = { ...props, ...otherContainerProps }

  const mergedStyle = {
    ...style,
    ...containerStyle,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties

  return (
    <TreeContext.Provider value={{ indent, tree, toggleIconType }}>
      <div
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
        {...mergedProps}
      />
    </TreeContext.Provider>
  )
}

interface TreeItemProps<T = any>
  extends Omit<useRender.ComponentProps<"div">, "indent"> {
  item: ItemInstance<T>
  indent?: number
}

function TreeItem<T = any>({ item, className, render, children, ...props }: TreeItemProps<T>) {
  const parentContext = useTreeContext<T>()
  const { indent } = parentContext

  const itemProps = typeof item.getProps === "function" ? item.getProps() : {}
  const mergedProps = { ...props, children, ...itemProps }

  const { style: propStyle, ...otherProps } = mergedProps

  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as React.CSSProperties

  const defaultProps = {
    "data-slot": "tree-item",
    style: mergedStyle,
    className: cn(
      "z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    ),
    "data-focus": typeof item.isFocused === "function" ? item.isFocused() || false : undefined,
    "data-folder": typeof item.isFolder === "function" ? item.isFolder() || false : undefined,
    "data-selected": typeof item.isSelected === "function" ? item.isSelected() || false : undefined,
    "data-drag-target":
      typeof item.isDragTarget === "function" ? item.isDragTarget() || false : undefined,
    "data-search-match":
      typeof item.isMatchingSearch === "function" ? item.isMatchingSearch() || false : undefined,
    // Deliberately not set here: Headless Tree's own getProps() provides it, conditional on
    // the item being a folder, and that value wins in the merge below. An unconditional
    // version here would only override it with aria-expanded on leaf rows.
  }

  return (
    <TreeContext.Provider value={{ ...parentContext, currentItem: item }}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, otherProps),
      })}
    </TreeContext.Provider>
  )
}

interface TreeItemLabelProps<T = any> extends React.HTMLAttributes<HTMLSpanElement> {
  item?: ItemInstance<T>
}

function TreeItemLabel<T = any>({ item: propItem, children, className, ...props }: TreeItemLabelProps<T>) {
  const { currentItem, toggleIconType } = useTreeContext<T>()
  const item = propItem || currentItem

  if (!item) {
    console.warn("TreeItemLabel: No item provided via props or context")
    return null
  }

  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "in-focus-visible:ring-ring/50 bg-background hover:bg-accent in-data-[selected=true]:bg-accent in-data-[selected=true]:text-accent-foreground in-data-[drag-target=true]:bg-accent flex items-center gap-1 rounded-md py-1.5 px-2 text-sm transition-colors not-in-data-[folder=true]:ps-7 in-focus-visible:ring-[3px] [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {item.isFolder() &&
        (toggleIconType === "plus-minus" ? (
          item.isExpanded() ? (
            <MinusIcon className="text-muted-foreground size-3.5" strokeWidth={1} />
          ) : (
            <PlusIcon className="text-muted-foreground size-3.5" strokeWidth={1} />
          )
        ) : (
          <ChevronDownIcon className="text-muted-foreground size-4 in-aria-[expanded=false]:-rotate-90" />
        ))}
      {children || (typeof item.getItemName === "function" ? item.getItemName() : null)}
    </span>
  )
}

function TreeDragLine({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { tree } = useTreeContext() as { tree?: { getDragLineStyle?: () => React.CSSProperties } }

  if (!tree || typeof tree.getDragLineStyle !== "function") {
    return null
  }

  const dragLine = tree.getDragLineStyle()
  return (
    <div
      style={dragLine}
      className={cn(
        "bg-primary before:bg-background before:border-primary absolute z-30 -mt-px h-0.5 w-[unset] rounded-full before:absolute before:-top-[3px] before:left-0 before:size-2 before:rounded-full before:border-2",
        className,
      )}
      {...props}
    />
  )
}

export { Tree, TreeItem, TreeItemLabel, TreeDragLine }
