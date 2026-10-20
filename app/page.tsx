import { Studio } from "@/components/studio";
import { SITE_NAME } from "@/lib/site";

export default function HomePage() {
  return <Studio siteName={SITE_NAME} />;
}