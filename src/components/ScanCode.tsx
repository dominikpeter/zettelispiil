"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { press } from "@/lib/ui";

/** Pulls a room code out of a scanned QR: our join link (…/r/AB3KX) or a bare 4–6 character code. */
export function codeFromQr(text: string): string | null {
  const m = text.match(/\/r\/([A-Za-z0-9]{4,6})\b/) ?? text.trim().match(/^([A-Za-z0-9]{4,6})$/);
  return m ? m[1].toUpperCase() : null;
}

type Labels = { scan: string; pointCamera: string; noCamera: string; close: string };

/** 📷 button → full-screen camera that reads the room QR and hands back the code. */
export function ScanCode({ onCode, labels }: { onCode: (code: string) => void; labels: Labels }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const found = useEffectEvent((code: string) => onCode(code)); // latest callback without restarting the camera

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        const [{ default: jsQR }, s] = await Promise.all([
          import("jsqr"), // only downloaded when someone actually scans
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ]);
        stream = s;
        if (stopped || !video.current) return s.getTracks().forEach((t) => t.stop());
        video.current.srcObject = s;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          if (stopped || !v || !ctx) return;
          if (v.readyState >= 2 && v.videoWidth) {
            // ponytail: scan a downscaled frame (≤480px) — plenty for a big on-screen QR, much cheaper per frame
            const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * k);
            canvas.height = Math.round(v.videoHeight * k);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const hit = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            const code = hit && codeFromQr(hit.data);
            if (code) {
              navigator.vibrate?.(40);
              sheet.current?.close();
              return found(code);
            }
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError(true); // no camera, permission denied, or not https
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(false);
          setOpen(true);
          sheet.current?.showModal();
        }}
        aria-label={labels.scan}
        className={`grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-2xl ${press}`}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 12h8" /></svg>
      </button>
      <dialog
        ref={sheet}
        onClose={() => setOpen(false)}
        className="sheet m-auto h-dvh max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        <div className="relative flex h-full flex-col items-center justify-center">
          <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
          {/* viewfinder */}
          <div className="relative size-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]">
            <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-gold" />
          </div>
          <p className="relative mt-6 max-w-xs text-center text-lg font-semibold">{error ? labels.noCamera : labels.pointCamera}</p>
          <button
            onClick={() => sheet.current?.close()}
            aria-label={labels.close}
            className={`absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-12 place-items-center rounded-full bg-black/60 text-2xl ${press}`}
          >
            ×
          </button>
        </div>
      </dialog>
    </>
  );
}
