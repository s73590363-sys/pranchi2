import { useRef, useState, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Aspect = "free" | "1:1" | "4:5" | "16:9";

const ASPECT_VALUES: Record<Aspect, number | undefined> = {
  free: undefined,
  "1:1": 1,
  "4:5": 4 / 5,
  "16:9": 16 / 9,
};

interface ImageCropperProps {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onCropped: (blob: Blob) => Promise<void> | void;
}

const ImageCropper = ({ open, file, onCancel, onCropped }: ImageCropperProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<Aspect>("free");
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // load src whenever file changes
  if (file && !src) {
    const reader = new FileReader();
    reader.onload = () => setSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const handleClose = () => {
    setSrc(null);
    setCrop(undefined);
    setCompleted(null);
    setAspect("free");
    onCancel();
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const a = ASPECT_VALUES[aspect];
    if (a) {
      const c = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, a, width, height), width, height);
      setCrop(c);
    } else {
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    }
  }, [aspect]);

  const changeAspect = (a: Aspect) => {
    setAspect(a);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const v = ASPECT_VALUES[a];
      if (v) {
        const c = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, v, width, height), width, height);
        setCrop(c);
      } else {
        setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
      }
    }
  };

  const handleSave = async () => {
    if (!imgRef.current || !completed) return;
    setSaving(true);
    try {
      const img = imgRef.current;
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(completed.width * scaleX);
      canvas.height = Math.round(completed.height * scaleY);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        completed.x * scaleX,
        completed.y * scaleY,
        completed.width * scaleX,
        completed.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Crop failed"))), "image/jpeg", 0.92),
      );
      await onCropped(blob);
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="glass-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Crop photo</DialogTitle>
          <DialogDescription className="font-body">Adjust the crop area, then upload.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {(["free", "1:1", "4:5", "16:9"] as Aspect[]).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={aspect === a ? "default" : "outline"}
              onClick={() => changeAspect(a)}
              className="font-body"
            >
              {a === "free" ? "Free" : a}
            </Button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-lg bg-black/40 flex items-center justify-center p-2">
          {src && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompleted(c)}
              aspect={ASPECT_VALUES[aspect]}
              keepSelection
            >
              <img ref={imgRef} src={src} alt="To crop" onLoad={onImageLoad} className="max-h-[55vh] w-auto" />
            </ReactCrop>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!completed || saving}
            className="bg-foreground text-background hover:bg-foreground/90 font-display gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropper;
