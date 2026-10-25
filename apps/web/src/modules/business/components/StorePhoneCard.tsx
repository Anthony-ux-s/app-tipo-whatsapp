import { Phone } from "lucide-react";
import { useState } from "react";
import { useBusinessStore } from "@shared/stores/business.store";
import { toast } from "@shared/stores/toast.store";
import { Button } from "@shared/ui/Button";
import { Field } from "@shared/ui/Field";
import { errorMessage } from "@shared/utils/http";

/** Teléfono de la tienda: los clientes lo ven en la tienda para llamarla o escribirle. Obligatorio. */
export function StorePhoneCard() {
  const business = useBusinessStore((s) => s.business);
  const updateBusiness = useBusinessStore((s) => s.updateBusiness);
  const [phone, setPhone] = useState(business?.phone ?? "");
  const [saving, setSaving] = useState(false);
  if (!business) return null;
  const missing = !business.phone;
  const changed = phone.trim() !== business.phone;
  const valid = phone.replace(/\D/g, "").length >= 8;

  const save = async () => {
    setSaving(true);
    try {
      await updateBusiness({ phone: phone.trim() });
      toast("Teléfono de la tienda guardado", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl p-4 shadow-float md:p-5 ${missing ? "bg-amber-50 dark:bg-amber-950/40" : "bg-surface"}`}
      aria-label="Teléfono de la tienda"
      data-testid="store-phone-card"
    >
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Phone className="size-5 text-brand dark:text-teal-300" /> Teléfono de
        la tienda
      </h2>
      {missing && (
        <p className="text-sm text-ink">
          Falta tu teléfono: tus clientes no pueden hablarte. Agrégalo para que
          salga en tu tienda.
        </p>
      )}
      <Field
        label="Teléfono"
        type="tel"
        autoComplete="tel"
        placeholder="ej. +51 999 111 222"
        maxLength={30}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        hint="Con indicativo del país. Tus clientes lo ven para llamarte o escribirte por WhatsApp."
      />
      {(missing || changed) && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!changed || !valid}
            loading={saving}
            onClick={() => void save()}
            data-testid="save-store-phone"
          >
            Guardar teléfono
          </Button>
        </div>
      )}
    </section>
  );
}
