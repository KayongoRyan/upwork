import { ChevronDown } from "lucide-react";

const articles = [
  {
    title: "What this portal is",
    body: "This is the administrator portal for CPMIS at Vertexa Group. The project manager, site engineer, and quantity surveyor each have their own portal on this machine. There is no sign-in. This one opens as Amina Uwase.",
  },
  {
    title: "Where records live",
    body: "Projects, people, reports, and notes sit in memory in the one server process. Refreshing keeps them. Stopping that process restores the sample records.",
  },
  {
    title: "Users and employees",
    body: "User Management is application accounts and roles. Employees is the workforce list. The two lists stay separate.",
  },
  {
    title: "Money on the reports",
    body: "Budgets, bills, and cost statements are demonstration figures in Rwandan francs (RWF). They are not a company ledger.",
  },
  {
    title: "What the preview administrator can do",
    body: "Amina Uwase is the administrator in the header. You can rename that profile in Settings. The account cannot be deactivated or deleted. On Notifications, open a portal to see that portal’s dashboard and work, and leave a comment only the project manager of that work can see.",
  },
];

export function HelpArticles() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {articles.map((article, index) => (
        <details key={article.title} open={index === 0} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium">{article.title}</span>
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">{article.body}</p>
        </details>
      ))}
    </div>
  );
}
