interface CompareGuideProps {
  competitor: string;
  children: React.ReactNode;
}

// Each page's frontmatter keeps `sources` and `lastVerified` as the research
// record; they aren't shown on the page.
export function CompareGuide({ competitor, children }: CompareGuideProps) {
  return (
    <section className="w-full px-10 py-14 md:py-16">
      <h2 className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight text-balance md:text-3xl">
        QRdx or {competitor}: which should you use?
      </h2>

      <div className="mx-auto mt-10 w-full max-w-3xl">
        <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:font-medium prose-a:text-foreground prose-a:decoration-foreground/30 prose-a:underline-offset-4 hover:prose-a:decoration-foreground">
          {children}
        </div>
      </div>
    </section>
  );
}
