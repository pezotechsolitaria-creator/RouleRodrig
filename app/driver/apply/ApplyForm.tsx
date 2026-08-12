"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Deliberately short. Every extra field on a form like this loses applicants,
// and the network needs drivers more than it needs their life story — the
// things that actually gate approval are a name, a reachable number and a
// vehicle. Licence details are asked for but optional at this stage: the admin
// checks documents in person on an island this size, and demanding an upload
// before anyone has agreed to anything would stop applications dead.
const VEHICLES = [
  { value: "scooter", label: "Scooter or motorbike" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van or pickup" },
  { value: "bicycle", label: "Bicycle" },
  { value: "foot", label: "On foot" },
];

const input =
  "w-full min-h-[48px] rounded-xl border border-dark-border bg-dark px-4 font-dm text-base text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none";

export default function ApplyForm({ existingStatus }: { existingStatus: string | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("scooter");
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [licence, setLicence] = useState("");
  const [hours, setHours] = useState("");
  const [experience, setExperience] = useState("");
  const [emergency, setEmergency] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy || !terms) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/driver/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, phone, vehicleType,
          vehicleDetails: vehicleDetails || undefined,
          licenceReference: licence || undefined,
          preferredHours: hours || undefined,
          experienceNote: experience || undefined,
          emergencyContact: emergency || undefined,
          acceptTerms: terms,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't send that.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  if (done || existingStatus === "pending") {
    return (
      <div className="rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-6 text-center">
        <CheckCircle2 size={28} className="mx-auto text-green-400" />
        <h2 className="mt-3 font-syne text-xl font-bold">Application received</h2>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Roulé Rodrigues will check it and get in touch. You&apos;ll be able to take deliveries as soon as
          it&apos;s approved — nothing to do until then.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => router.push("/driver")}>
          Back to my dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="d-name" className="mb-1.5 block font-dm text-sm text-muted">Full name</label>
        <input id="d-name" className={input} value={fullName} onChange={(e) => setFullName(e.target.value)}
               placeholder="Jean Baptiste" autoComplete="name" />
      </div>

      <div>
        <label htmlFor="d-phone" className="mb-1.5 block font-dm text-sm text-muted">
          WhatsApp number
        </label>
        <input id="d-phone" className={input} value={phone} onChange={(e) => setPhone(e.target.value)}
               placeholder="+230 5835 5588" inputMode="tel" autoComplete="tel" />
        <p className="mt-1 font-dm text-xs text-muted/70">This is how we reach you about deliveries.</p>
      </div>

      <div>
        <label htmlFor="d-vehicle" className="mb-1.5 block font-dm text-sm text-muted">What do you drive?</label>
        <select id="d-vehicle" className={input} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
          {VEHICLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="d-vdetails" className="mb-1.5 block font-dm text-sm text-muted">
          Make, model or colour <span className="text-muted/60">(optional)</span>
        </label>
        <input id="d-vdetails" className={input} value={vehicleDetails}
               onChange={(e) => setVehicleDetails(e.target.value)} placeholder="Red Vespa" />
      </div>

      <div>
        <label htmlFor="d-licence" className="mb-1.5 block font-dm text-sm text-muted">
          Driving licence number <span className="text-muted/60">(optional)</span>
        </label>
        <input id="d-licence" className={input} value={licence} onChange={(e) => setLicence(e.target.value)} />
        <p className="mt-1 font-dm text-xs text-muted/70">
          We&apos;ll check your licence in person before you start.
        </p>
      </div>

      <div>
        <label htmlFor="d-hours" className="mb-1.5 block font-dm text-sm text-muted">
          When can you usually deliver? <span className="text-muted/60">(optional)</span>
        </label>
        <input id="d-hours" className={input} value={hours} onChange={(e) => setHours(e.target.value)}
               placeholder="Weekday evenings, all day Saturday" />
      </div>

      <div>
        <label htmlFor="d-exp" className="mb-1.5 block font-dm text-sm text-muted">
          Any delivery experience? <span className="text-muted/60">(optional)</span>
        </label>
        <textarea id="d-exp" rows={2} value={experience} onChange={(e) => setExperience(e.target.value)}
                  className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-base text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none" />
      </div>

      <div>
        <label htmlFor="d-ice" className="mb-1.5 block font-dm text-sm text-muted">
          Emergency contact <span className="text-muted/60">(optional)</span>
        </label>
        <input id="d-ice" className={input} value={emergency} onChange={(e) => setEmergency(e.target.value)}
               placeholder="+230 5900 0000" inputMode="tel" />
        <p className="mt-1 font-dm text-xs text-muted/70">Only used if something happens while you&apos;re working.</p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-dark-card p-4">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)}
               className="mt-0.5 h-5 w-5 shrink-0 accent-yellow" />
        <span className="font-dm text-sm text-offwhite/85">
          I agree to the delivery partner terms. I understand I&apos;m an independent driver, not an employee,
          and that I&apos;m responsible for my own vehicle, licence and insurance.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      <Button className="min-h-[52px] w-full text-base" disabled={busy || !terms || !fullName.trim() || !phone.trim()}
              onClick={() => void submit()}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : "Send application"}
      </Button>

      <p className="text-center font-dm text-xs text-muted">
        Free to join. Roulé Rodrigues reviews every application before you can take deliveries.
      </p>
    </div>
  );
}
