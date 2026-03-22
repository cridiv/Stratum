import Link from "next/link";

export default function Home() {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold">Welcome to Stratum</h1>
      <p className="mt-2 text-sm text-gray-600">
        Open the transcript workspace to review chunks and metadata.
      </p>
      <Link
        href="/transcript"
        className="mt-4 inline-flex rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Go to Transcript
      </Link>
    </section>
  );
}
