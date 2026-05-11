import { notFound } from "next/navigation";
import { AddWordForm } from "@/components/parent/AddWordForm";
import { getParentWordForEdit } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function EditWordPage({
  params,
}: {
  params: Promise<{ wordId: string }>;
}) {
  const { wordId } = await params;
  const word = getParentWordForEdit(wordId);
  if (!word) notFound();

  return (
    <main className="page">
      <section className="page-title">
        <h1>Edit vocabulary word</h1>
        <p>Adjust the reviewed definition and examples used in child practice.</p>
      </section>

      <AddWordForm
        mode="edit"
        wordId={word.id}
        initialValues={{
          word: word.word,
          definition: word.definition,
          examples: word.examples,
          synonyms: word.synonyms.join(", "),
          antonyms: word.antonyms.join(", "),
        }}
        cancelHref="/parent/words"
        returnTo="/parent/words"
      />
    </main>
  );
}
