// The @modal slot: "Make a collection or kit" opens as a modal over the
// community page it was opened from (see @modal/(.)new). A direct visit to
// /community/new still gets the full page.
export default function CommunityLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
