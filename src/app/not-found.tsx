import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";

export default function NotFound() {
  return (
    <ContentPage cta={false}>
      <h1>Lost in space</h1>
      <p>That page doesn&apos;t exist. Let&apos;s get you back on course.</p>
      <p>
        <Link href="/">Home</Link> · <Link href="/destinations">Destinations</Link> · <Link href="/explore">Launch simulator</Link>
      </p>
    </ContentPage>
  );
}
