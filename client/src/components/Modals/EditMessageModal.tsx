import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface EditMessageModalProps {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (content: string) => void | Promise<void>;
  title?: string;
}

export function EditMessageModal({ open, initialValue, onClose, onSave, title = "Edit message" }: EditMessageModalProps) {
  const [value, setValue] = useState(initialValue ?? "");

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue, open]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await onSave(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Update your message..."
            autoFocus
            data-testid="input-edit-message"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
          <Button onClick={handleSave} data-testid="button-save-edit">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
