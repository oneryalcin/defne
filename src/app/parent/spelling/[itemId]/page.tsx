import { notFound } from "next/navigation";
import { AddSpellingItemForm } from "@/components/parent/AddSpellingItemForm";
import { getParentSpellingItemForEdit } from "@/lib/db/spellingRepository";
import { resolveSelectedLearnerId } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

export default async function EditSpellingItemPage({
  params,
  searchParams
}: {
  params: Promise<{ itemId: string }>;
  searchParams?: Promise<{ learnerId?: string }>;
}) {
  const { itemId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
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
        initialItemId={item.id}
        learnerId={learnerId}
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
