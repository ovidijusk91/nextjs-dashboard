import Form from '@/app/ui/customers/create-form';
import Breadcrumbs from '@/app/ui/invoices/breadcrumbs';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Create Customer',
};

export default async function Page() {
    return (
        <main>
            <Breadcrumbs
                breadcrumbs={[
                    { label: 'Invoices', href: '/dashboard/customers' },
                    {
                        label: 'Create Customer',
                        href: '/dashboard/invoices/create',
                        active: true,
                    },
                ]}
            />
            <Form />
        </main>
    );
}
