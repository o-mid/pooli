"use client";

import Link from "next/link";
import { Icons8Icon } from "@/components/icons/Icons8Icon";
import { Reveal } from "@/components/motion/Reveal";

/** ToDiagram architecture map — https://todiagram.com/editor?doc=806c2967e67c1f811c6778fc */
const TODIAGRAM_URL = "https://todiagram.com/editor?doc=806c2967e67c1f811c6778fc";

const steps = [
  { icon: "share" as const, key: "dm" },
  { icon: "link" as const, key: "link" },
  { icon: "wallet" as const, key: "pay" },
  { icon: "verified" as const, key: "verify" },
  { icon: "notification" as const, key: "notify" },
];

export function FlowDiagramCard({
  title,
  caption,
  labels,
}: {
  title: string;
  caption: string;
  labels: Record<string, string>;
}) {
  return (
    <Reveal className="flow-diagram-card">
      <div className="flow-diagram-card-head">
        <Icons8Icon name="sparkles" size="lg" className="flow-diagram-spark" />
        <h3 className="marketing-h3">{title}</h3>
        <p className="muted flow-diagram-caption">{caption}</p>
      </div>
      <ol className="flow-diagram-pipeline" aria-label={title}>
        {steps.map((step, i) => (
          <li key={step.key}>
            <span className="flow-diagram-node">
              <Icons8Icon name={step.icon} size="md" />
              <span>{labels[step.key]}</span>
            </span>
            {i < steps.length - 1 ? <span className="flow-diagram-arrow" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      <p className="flow-diagram-foot">
        <Link href={TODIAGRAM_URL} target="_blank" rel="noopener noreferrer">
          {labels.openDiagram}
        </Link>
      </p>
    </Reveal>
  );
}
