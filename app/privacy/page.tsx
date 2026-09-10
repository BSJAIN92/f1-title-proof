import Link from "next/link";

export default function PrivacyPage() {
  return <main className="privacy-notice"><p className="eyebrow">Title Proof · privacy</p><h1>Activity data</h1>
    <p>Title Proof uses a random browser identifier to keep calculation history and measure anonymous product activity. The database stores a one-way hash of that identifier, not its original value.</p>
    <h2>What is recorded</h2><ul><li>Visits, calculations, and driver or constructor comparisons.</li><li>A two-letter country code supplied by Vercel. IP addresses are not stored in the activity database.</li><li>Anonymous calculation history needed to reopen prior results in the same browser.</li></ul>
    <h2>How long it is kept</h2><p>The browser identifier expires after 90 days. Activity, calculation history, and daily reports older than 90 days are deleted by an automated retention job.</p>
    <h2>What is not collected</h2><p>The app does not ask for a name, email address, phone number, or account profile. Anonymous activity is used to understand product usage and protect service reliability.</p>
    <Link href="/">← Return to Title Proof</Link>
  </main>;
}
