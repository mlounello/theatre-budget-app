"use client";

import { useState } from "react";

export function ContractCalendarSubscription({
  feedUrl,
  googleCalendarUrl
}: {
  feedUrl: string;
  googleCalendarUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyFeedUrl() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className="panel">
      <p className="eyebrow">Automatic Calendar</p>
      <h2>Contract Check Request Calendar</h2>
      <p className="helperText">
        Subscribe once to automatically receive every scheduled “mail check request” date.
        Date changes update the same event instead of creating duplicates. Google refreshes
        subscribed calendars on its own schedule, so updates may take several hours.
      </p>
      <div className="inlineEditForm">
        <a className="tinyButton" href={googleCalendarUrl} target="_blank" rel="noreferrer">
          Subscribe in Google Calendar
        </a>
        <button className="tinyButton" type="button" onClick={() => void copyFeedUrl()}>
          {copied ? "Copied" : "Copy Subscription URL"}
        </button>
      </div>
      <p className="helperText">
        This is a private, read-only calendar link. Do not share it. If Google does not add it
        automatically, choose <strong>Other calendars → From URL</strong> in Google Calendar
        and paste the copied subscription URL.
      </p>
    </article>
  );
}

