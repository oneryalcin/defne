import { AddSpellingItemForm } from "@/components/parent/AddSpellingItemForm";

export default function NewSpellingItemPage() {
  return (
    <main className="page">
      <section className="page-title">
        <h1>Add a spelling word</h1>
        <p>Save clean sentences. The child practice will create zero-or-one mistake versions from this reviewed content.</p>
      </section>

      <AddSpellingItemForm />
    </main>
  );
}
