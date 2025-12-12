import { AnimatedFolder } from "@/components/ui/animated-folder";

const portfolioData = [
  {
    title: "Explore",
    projects: [
      {
        id: "1",
        image:
          "https://plus.unsplash.com/premium_photo-1723489242223-865b4a8cf7b8?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D$0",
        title: "Lumnia",
      },
      {
        id: "2",
        image:
          "https://i.pinimg.com/1200x/99/ca/5c/99ca5cf82cf12df8801f7b2bef38d325.jpg",
        title: "Prism",
      },
      {
        id: "3",
        image:
          "https://i.pinimg.com/736x/7c/15/39/7c1539cf7ff0207cb49ce0d338de1e5f.jpg",
        title: "Vertex",
      },
    ],
  },
];

export default function AnimatedFolderKit() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center w-full">
      {/* Main content */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-center w-full">
          {portfolioData.map((folder) => (
            <AnimatedFolder
              key={folder.title}
              title={folder.title}
              projects={folder.projects}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
