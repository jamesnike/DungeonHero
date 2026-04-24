"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useOverlayScale } from "@/hooks/use-overlay-scale"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentMotionDefault =
  "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]";

/** 仅淡入淡出，避免 zoom/slide 带动整页重绘（大卡列表弹窗） */
const dialogContentMotionFade =
  "duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

/**
 * 「从 cell 弹出来」动画：scale 50% → 100% + 淡入淡出，配合 useDialogOriginAnchor
 * 把 transform-origin 设到点击的 cell 中心。slide 类被刻意去掉——slide + scale
 * 同时用会让弹窗看起来"从对角扫过来"而不是"从 cell 长出来"，体感不对。
 *
 * 性能：scale 50→100% 比默认的 zoom-in-95 大，但配合两步 mount（heavy list 推到
 * 下一帧）这一点开销忽略不计——动画期间画的是空 shell，不是 N 张卡。
 */
const dialogContentMotionOrigin =
  "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-50 data-[state=open]:zoom-in-50";

/**
 * Mounts a transparent click-absorber for ~350ms to swallow the synthesized
 * "ghost click" iOS/Android dispatch after the user closes a dialog. Without
 * this, that delayed click lands on whatever element is now under the touch
 * position and accidentally activates it.
 *
 * Two scenarios this protects:
 *   1) Click lands on the game board (relics, cards) — the shield covers
 *      everything below z-60 and absorbs it.
 *   2) STACKED DIALOGS — closing the topmost dialog leaves another dialog's
 *      overlay (z-50) directly underneath. Without the shield, a ghost click
 *      hits that lower overlay → onPointerDownOutside → the lower dialog
 *      gets accidentally dismissed too. The shield therefore sits ABOVE
 *      every dialog overlay (z-60 > z-50) so the synthetic click cannot
 *      reach a stacked dialog beneath the one that just closed.
 *
 * The shield mounts on EVERY DialogContent unmount (any close path: outside
 * click, ESC, X button, Cancel button, programmatic state change). 350 ms
 * is well above the longest synthetic-click delay browsers fire and short
 * enough to be invisible to intentional rapid clicks on a dialog beneath.
 */
function mountGhostClickShield(durationMs = 350) {
  if (typeof document === "undefined") return
  const shield = document.createElement("div")
  shield.style.cssText =
    "position:fixed;inset:0;z-index:60;background:transparent;pointer-events:auto;touch-action:none;"
  shield.setAttribute("aria-hidden", "true")
  shield.setAttribute("data-ghost-click-shield", "")
  const swallow = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  shield.addEventListener("click", swallow)
  shield.addEventListener("pointerdown", swallow)
  shield.addEventListener("pointerup", swallow)
  shield.addEventListener("touchstart", swallow, { passive: false })
  shield.addEventListener("touchend", swallow, { passive: false })
  document.body.appendChild(shield)
  window.setTimeout(() => {
    shield.remove()
  }, durationMs)
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    overlayClassName?: string;
    contentMotion?: "default" | "fade" | "origin";
    /** Set false to opt-out of viewport-based auto-zoom (default true). */
    autoScale?: boolean;
  }
>(({ className, children, overlayClassName, contentMotion = "default", style, autoScale = true, onInteractOutside, ...props }, ref) => {
  const overlayScale = useOverlayScale();
  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(autoScale ? { zoom: overlayScale } : undefined),
  };
  const handleInteractOutside = React.useCallback(
    (event: Parameters<NonNullable<typeof onInteractOutside>>[0]) => {
      onInteractOutside?.(event);
      if (!event.defaultPrevented) {
        mountGhostClickShield();
      }
    },
    [onInteractOutside],
  );
  // Belt-and-suspenders shield mount: also fire on full unmount so any close
  // path that DIDN'T flow through onInteractOutside (X button, ESC,
  // in-content button click, programmatic state change) still drops a shield.
  // Critical for stacked-dialog scenarios where closing the top dialog must
  // not let a ghost click reach the dialog overlay underneath. See
  // mountGhostClickShield() comment for the full rationale.
  React.useEffect(() => {
    return () => {
      mountGhostClickShield();
    };
  }, []);
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
          contentMotion === "fade"
            ? dialogContentMotionFade
            : contentMotion === "origin"
              ? dialogContentMotionOrigin
              : dialogContentMotionDefault,
          className
        )}
        style={mergedStyle}
        onInteractOutside={handleInteractOutside}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
