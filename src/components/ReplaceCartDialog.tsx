import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";

/**
 * Global "replace cart from another vendor" confirmation. Mounted once at the
 * app shell level — any `cart.tryAdd(...)` that hits a vendor conflict will
 * automatically surface this dialog without the caller needing local state.
 */
export function ReplaceCartDialog() {
  const { pending, confirmReplace, cancelReplace, items } = useCart();
  const open = !!pending;

  const currentVendor =
    items[0]?.vendor_name ?? items[0]?.vendor_slug ?? "بائع آخر";
  const incomingVendor =
    pending?.product.vendor_name ??
    pending?.product.vendor_slug ??
    "البائع الجديد";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancelReplace();
      }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>استبدال السلة</AlertDialogTitle>
          <AlertDialogDescription>
            سلتك تحتوي على منتجات من{" "}
            <span className="font-semibold text-foreground">{currentVendor}</span>.
            لا يمكنك خلط بائعَين في طلب واحد. هل تريد استبدالها بمنتجات من{" "}
            <span className="font-semibold text-foreground">{incomingVendor}</span>؟
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelReplace}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirmReplace();
              toast.success("تم تحديث السلة");
            }}
          >
            استبدال السلة
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
