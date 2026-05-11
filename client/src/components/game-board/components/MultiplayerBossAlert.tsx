/**
 * MultiplayerBossAlert — phase 6.2 advisory dialog.
 *
 * The plan does not (yet) support synchronous co-op boss fights. When the
 * shared 36-card deck reveals its final monster (Boss), the waterfall
 * reducer fires `multiplayer:bossEncountered` exactly once per game (gated
 * on `state.bossEncounterAlertShown`). GameBoard listens for that event
 * and pops this dialog.
 *
 * The underlying combat continues to reduce as solo — this is purely a
 * UX advisory so the player isn't surprised that "the partner can't help
 * with the Boss". Card transfers keep flowing in both directions; the
 * Boss is a per-player encounter just like any other monster, and each
 * side resolves their own.
 *
 * Stateless / fully controlled — parent owns the open flag.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

interface MultiplayerBossAlertProps {
  open: boolean;
  onAcknowledge: () => void;
}

export function MultiplayerBossAlert({ open, onAcknowledge }: MultiplayerBossAlertProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        // Closing via overlay click / Esc is treated the same as clicking
        // the action button — there's only one positive outcome here.
        if (!isOpen) onAcknowledge();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('gameBoard.multiplayerBossAlert.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('gameBoard.multiplayerBossAlert.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onAcknowledge}>
            {t('gameBoard.multiplayerBossAlert.ok')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
