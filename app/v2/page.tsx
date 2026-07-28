import { redirect } from "next/navigation";

// The app-style homepage is now LIVE at `/`, so the old preview URL just
// forwards there (keeps any old links/bookmarks working).
export default function V2Page() {
  redirect("/");
}
