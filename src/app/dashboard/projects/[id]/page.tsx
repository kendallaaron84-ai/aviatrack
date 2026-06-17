import { redirect } from 'next/navigation';

export default function LegacyProjectPage({ params }: { params: { id: string } }) {
    // Redirect legacy dashboard URLs to the new top-level /project route
    redirect(`/project/${params.id}`);
}
