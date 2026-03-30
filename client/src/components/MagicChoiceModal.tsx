import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export interface MagicChoiceOption {
  id: string;
  label: string;
  description: string;
}

export interface MagicChoiceModalState {
  title: string;
  subtitle?: string;
  options: MagicChoiceOption[];
}

interface MagicChoiceModalProps {
  open: boolean;
  state: MagicChoiceModalState | null;
  onChoice: (optionId: string) => void;
}

export default function MagicChoiceModal({ open, state, onChoice }: MagicChoiceModalProps) {
  if (!state) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md max-h-[95vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            {state.title}
          </DialogTitle>
          {state.subtitle && (
            <DialogDescription>{state.subtitle}</DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3">
          {state.options.map((option) => (
            <Button
              key={option.id}
              variant="outline"
              className="h-auto w-full justify-start p-4 text-left"
              onClick={() => onChoice(option.id)}
            >
              <div className="flex w-full flex-col gap-1.5">
                <span className="font-semibold text-base">{option.label}</span>
                <span className="text-sm text-muted-foreground whitespace-normal">{option.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
