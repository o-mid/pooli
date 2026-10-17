"use client";

import { Icons8Icon, type Icons8Name } from "@/components/icons/Icons8Icon";
import { BorderBeam } from "@/components/motion/BorderBeam";
import { HoverLift } from "@/components/motion/HoverLift";
import { StaggerItem, StaggerRoot } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { useLocale, useT } from "@/i18n/LocaleProvider";

const rows: Array<{
  titleKey: "s1Title" | "s2Title" | "s3Title";
  bodyKey: "s1Body" | "s2Body" | "s3Body";
  icon: Icons8Name;
}> = [
  { titleKey: "s1Title", bodyKey: "s1Body", icon: "add-link" },
  { titleKey: "s2Title", bodyKey: "s2Body", icon: "share" },
  { titleKey: "s3Title", bodyKey: "s3Body", icon: "verified" },
];

export function LandingFeatureRows() {
  const m = useT().marketing;
  const { locale } = useLocale();
  const stepFmt = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en", { minimumIntegerDigits: 2 });

  return (
    <div className="lp-features" id="how-it-works">
      <h2 className="lp-section-title">
        <TextReveal text={m.steps.title} />
      </h2>
      <StaggerRoot>
        {rows.map((row, index) => {
          const flip = index % 2 === 1;
          return (
            <StaggerItem key={row.titleKey}>
              <HoverLift>
                <article className={`lp-feature-row${flip ? " lp-feature-row-flip" : ""}`}>
                  <div className="lp-feature-copy">
                    <p className="lp-feature-step" aria-hidden="true">{stepFmt.format(index + 1)}</p>
                    <h3 className="lp-feature-heading">{m.steps[row.titleKey]}</h3>
                    <p className="muted">{m.steps[row.bodyKey]}</p>
                  </div>
                  <div className="lp-feature-visual" aria-hidden="true">
                    <div className="lp-feature-icon-card lp-beam-host">
                      <BorderBeam size={56} duration={2.4} />
                      <Icons8Icon name={row.icon} size="lg" />
                    </div>
                  </div>
                </article>
              </HoverLift>
            </StaggerItem>
          );
        })}
      </StaggerRoot>
    </div>
  );
}
