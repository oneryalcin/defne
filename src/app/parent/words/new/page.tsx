import { AddWordForm } from "@/components/parent/AddWordForm";

export default function NewWordPage() {
  return (
    <main className="page">
      <section className="page-title">
        <h1>Add a word</h1>
        <p>Review the wording before it enters practice.</p>
      </section>

      <AddWordForm />
    </main>
  );
}
