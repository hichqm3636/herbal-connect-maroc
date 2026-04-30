import { ShoppingCart, Plus, Minus, Trash2, Package } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/hooks/useCart";
import { formatMAD } from "@/lib/format";

export function CartButton() {
  const { totalQty, openCart } = useCart();
  const label =
    totalQty > 0 ? `فتح السلة، ${totalQty} عنصر` : "فتح السلة، فارغة";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative"
      onClick={openCart}
      aria-label={label}
      aria-haspopup="dialog"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      {totalQty > 0 && (
        <span
          className="absolute -top-1 -end-1 bg-warning text-warning-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center"
          aria-hidden="true"
        >
          {totalQty}
        </span>
      )}
    </Button>
  );
}

export function CartSheet() {
  const { items, isOpen, setOpen, updateQty, removeItem, clear, total } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    setOpen(false);
    navigate({ to: "/checkout" });
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="left" dir="rtl" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>سلة التسوق</SheetTitle>
          <SheetDescription>
            راجع منتجاتك قبل المتابعة لإتمام الطلب.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <ShoppingCart className="h-10 w-10" />
              <p className="text-sm">سلتك فارغة</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-lg border bg-card p-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name_ar}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name_ar}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMAD(Number(item.price_mad))}
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.id, -1)}
                        aria-label="إنقاص الكمية"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.id, 1)}
                        aria-label="زيادة الكمية"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ms-auto h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeItem(item.id)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="self-start text-sm font-bold tabular-nums">
                    {formatMAD(Number(item.price_mad) * item.qty)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">الإجمالي</span>
              <span className="text-lg font-bold">{formatMAD(total)}</span>
            </div>
            <SheetFooter className="flex-col gap-2 sm:flex-col">
              <Button className="w-full" size="lg" onClick={handleCheckout}>
                إتمام الطلب
              </Button>
              <Button variant="ghost" className="w-full" onClick={clear}>
                إفراغ السلة
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
