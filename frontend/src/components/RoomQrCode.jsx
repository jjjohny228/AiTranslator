import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function RoomQrCode({ value }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function build() {
      try {
        const nextSrc = await QRCode.toDataURL(value, {
          margin: 1,
          width: 220,
          color: {
            dark: "#0d1320",
            light: "#f7f8fb",
          },
        });
        if (!cancelled) {
          setSrc(nextSrc);
        }
      } catch {
        if (!cancelled) {
          setSrc("");
        }
      }
    }

    if (value) {
      void build();
    }

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return <div className="qr-placeholder">QR is loading...</div>;
  }

  return <img className="qr-image" src={src} alt="Room QR code" />;
}
