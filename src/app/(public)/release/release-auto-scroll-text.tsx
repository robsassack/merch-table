"use client";

import { useEffect, useRef, useState } from "react";

type AutoScrollTextProps = {
  text: string;
  className: string;
  speedPxPerSecond?: number;
  returnSpeedPxPerSecond?: number;
  pauseAtStartMs?: number;
  pauseAtEndMs?: number;
};

export default function AutoScrollText({
  text,
  className,
  speedPxPerSecond = 22,
  returnSpeedPxPerSecond = 170,
  pauseAtStartMs = 5_000,
  pauseAtEndMs = 1_600,
}: AutoScrollTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [marqueeDistance, setMarqueeDistance] = useState(0);

  useEffect(() => {
    const containerElement = containerRef.current;
    const measureElement = measureRef.current;
    if (!containerElement || !measureElement) {
      return;
    }

    const updateOverflowState = () => {
      const containerWidth = containerElement.clientWidth;
      const textWidth = measureElement.getBoundingClientRect().width;
      const overflowWidth = textWidth - containerWidth;

      if (overflowWidth <= 1) {
        setMarqueeDistance(0);
        return;
      }

      setMarqueeDistance(overflowWidth);
    };

    updateOverflowState();
    const animationFrameId = window.requestAnimationFrame(updateOverflowState);
    const timeoutId = window.setTimeout(updateOverflowState, 180);
    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(updateOverflowState);
    }

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflowState);
      return () => {
        window.cancelAnimationFrame(animationFrameId);
        window.clearTimeout(timeoutId);
        window.removeEventListener("resize", updateOverflowState);
      };
    }

    const resizeObserver = new ResizeObserver(updateOverflowState);
    resizeObserver.observe(containerElement);
    resizeObserver.observe(measureElement);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [text]);

  const shouldMarquee = marqueeDistance > 0;
  const forwardDurationMs = Math.max(3_200, (marqueeDistance / speedPxPerSecond) * 1_000);
  const returnDurationMs = Math.max(550, (marqueeDistance / returnSpeedPxPerSecond) * 1_000);
  const cycleDurationMs =
    pauseAtStartMs + forwardDurationMs + pauseAtEndMs + returnDurationMs;

  useEffect(() => {
    const trackElement = trackRef.current;
    if (!trackElement) {
      return;
    }

    if (!shouldMarquee) {
      trackElement.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      trackElement.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    let animationFrameId = 0;
    const startedAtMs = window.performance.now();

    const tick = (nowMs: number) => {
      const elapsedMs = (nowMs - startedAtMs) % cycleDurationMs;
      let offsetX = 0;

      if (elapsedMs <= pauseAtStartMs) {
        offsetX = 0;
      } else if (elapsedMs <= pauseAtStartMs + forwardDurationMs) {
        const progress = (elapsedMs - pauseAtStartMs) / forwardDurationMs;
        offsetX = -marqueeDistance * progress;
      } else if (elapsedMs <= pauseAtStartMs + forwardDurationMs + pauseAtEndMs) {
        offsetX = -marqueeDistance;
      } else {
        const progress =
          (elapsedMs - pauseAtStartMs - forwardDurationMs - pauseAtEndMs) /
          returnDurationMs;
        offsetX = -marqueeDistance * (1 - progress);
      }

      trackElement.style.transform = `translate3d(${offsetX}px, 0, 0)`;
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      trackElement.style.transform = "translate3d(0, 0, 0)";
    };
  }, [
    cycleDurationMs,
    forwardDurationMs,
    marqueeDistance,
    pauseAtEndMs,
    pauseAtStartMs,
    returnDurationMs,
    shouldMarquee,
  ]);

  return (
    <div ref={containerRef} className="relative min-w-0 overflow-hidden">
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0 ${className}`}
      >
        {text}
      </span>
      <div
        ref={trackRef}
        className={`${shouldMarquee ? "release-marquee-track flex w-max items-center" : "w-full"}`}
      >
        <span
          className={`${shouldMarquee ? "shrink-0 whitespace-nowrap" : "block truncate"} ${className}`}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
