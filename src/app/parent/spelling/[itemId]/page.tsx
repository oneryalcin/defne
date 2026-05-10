import { notFound } from "next/navigation";
import { AddSpellingItemForm } from "@/components/parent/AddSpellingItemForm";
import { getParentSpellingItemForEdit } from "@/lib/db/spellingRepository";

export const dynamic = "force-dynamic";

export default async function EditSpellingItemPage({
  params
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = getParentSpellingItemForEdit(itemId);
  if (!item) notFound();

  return (
    <main className="page">
      <section className="page-title">
        <h1>Edit spelling word</h1>
        <p>Adjust the reviewed note, pair, and clean sentences used to build child spelling questions.</p>
      </section>

      <AddSpellingItemForm
        mode="edit"
        initialValues={{
          target: item.target,
          pairedTarget: item.pairedTarget,
          usageLabel: item.usageLabel,
          teachingNote: item.teachingNote,
          sentences: [item.sentences[0] ?? "", item.sentences[1] ?? ""]
        }}
      />
    </main>
  );
}
