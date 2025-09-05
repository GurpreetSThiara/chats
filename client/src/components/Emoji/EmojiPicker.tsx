import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
}

const EMOJIS = [
  "👍","👎","❤️","🔥","🎉","😄","😂","😅","😊","😉","🤔","😮",
  "😭","🙏","👏","🎯","🚀","🍕","☕","🌟","💯","✅","❌","🧠"
];

export function EmojiPicker({ onSelect, triggerClassName }: EmojiPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={triggerClassName || "p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity"}
          data-testid="button-emoji-picker"
        >
          <Smile className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <div className="grid grid-cols-6 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="text-xl leading-none p-1 rounded hover:bg-muted"
              onClick={() => onSelect(e)}
              data-testid={`emoji-${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
