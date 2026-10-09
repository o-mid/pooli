"use client";

import { useT } from "@/i18n/LocaleProvider";
import { siteConfig } from "@/lib/site";

export function ClaudeView() {
  const t = useT();
  const p = t.marketing.claude;
  const programUrl = siteConfig.claudeUsage.anthropicStartupProgramUrl;

  return (
    <article className="claude-notes">
      <header className="marketing-page-header">
        <h1 className="marketing-h1">{p.title}</h1>
        <p className="marketing-lead">{p.lead}</p>
      </header>

      <section>
        <h2>{p.todayTitle}</h2>
        <h3>{p.engineeringTitle}</h3>
        <p>{p.engineeringBody}</p>
        <h3>{p.docsTitle}</h3>
        <p>{p.docsBody}</p>
        <h3>{p.toolingTitle}</h3>
        <p>{p.toolingBody}</p>
        <h3>{p.identityTitle}</h3>
        <p>{p.identityBody}</p>
      </section>

      <section>
        <h2>{p.wifTitle}</h2>
        <p>{p.wifLead}</p>
        <p>{p.wifMeans}</p>
        <ul>
          {p.wifPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>{p.wifClose}</p>
      </section>

      <section>
        <h2>{p.notLlmTitle}</h2>
        <p>{p.notLlmBody}</p>
        <p>{p.notLlmBody2}</p>
      </section>

      <section>
        <h2>{p.buildingTitle}</h2>
        <h3>{p.remindersTitle}</h3>
        <p>{p.remindersBody}</p>
        <h3>{p.questionsTitle}</h3>
        <p>{p.questionsBody}</p>
        <p>{p.evals}</p>
      </section>

      <section>
        <h2>{p.whyTitle}</h2>
        <p>{p.whyBody}</p>
      </section>

      <footer className="claude-notes-foot">
        <p>{p.builtIn}</p>
        <p>
          <a href={programUrl} rel="noopener noreferrer">
            {p.program}
          </a>
        </p>
      </footer>
    </article>
  );
}
