export function isManagerFieldNotice(
  item: {
    source: string;
    projectId: string | null;
    title: string;
    message: string;
    recipientId?: string | null;
  },
  projects: { id: string; code: string; name: string }[],
  managerId?: string | null,
) {
  if (managerId && item.recipientId === managerId) return true;
  if (item.source !== "site_engineer" && item.source !== "quantity_surveyor") return false;
  if (item.projectId && projects.some((project) => project.id === item.projectId)) return true;
  const text = `${item.title} ${item.message}`;
  return projects.some((project) => text.includes(project.code) || text.includes(project.name));
}
