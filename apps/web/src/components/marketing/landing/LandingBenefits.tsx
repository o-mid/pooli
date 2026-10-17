"use client";

import { Icons8Icon, type Icons8Name } from "@/components/icons/Icons8Icon";
import { HoverLift } from "@/components/motion/HoverLift";
import { StaggerItem, StaggerRoot } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { useT } from "@/i18n/LocaleProvider";

const benefitRows: Array<{
  icon: Icons8Name;
  titleKey: "b1Title" | "b2Title" | "b3Title" | "b4Title" | "b5Title" | "b6Title";
  bodyKey: "b1Body" | "b2Body" | "b3Body" | "b4Body" | "b5Body" | "b6Body";
}> = [
  { icon: "verified", titleKey: "b1Title", bodyKey: "b1Body" },
  { icon: "wallet", titleKey: "b2Title", bodyKey: "b2Body" },
  { icon: "orders", titleKey: "b3Title", bodyKey: "b3Body" },
  { icon: "notification", titleKey: "b4Title", bodyKey: "b4Body" },
  { icon: "globe", titleKey: "b5Title", bodyKey: "b5Body" },
  { icon: "share", titleKey: "b6Title", bodyKey: "b6Body" },
];

export function LandingBenefits() {
  const m = useT().marketing;

  return (
    <section className="lp-benefits">
      <h2 className="lp-section-title">
        <TextReveal text={m.benefits.title} />
      </h2>
      <StaggerRoot className="lp-benefit-grid">
        {benefitRows.map((row) => (
          <StaggerItem key={row.titleKey}>
            <HoverLift>
              <div className="lp-benefit-card">
                <Icons8Icon name={row.icon} size="lg" />
                <div>
                  <strong>{m.benefits[row.titleKey]}</strong>
                  <p className="muted">{m.benefits[row.bodyKey]}</p>
                </div>
              </div>
            </HoverLift>
          </StaggerItem>
        ))}
      </StaggerRoot>
    </section>
  );
}
