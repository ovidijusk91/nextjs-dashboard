'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
const pump = promisify(pipeline);
import { Customer } from './definitions';
import { slugify } from './utils';
import { put, del } from "@vercel/blob";

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string(),
    amount: z.coerce.number(),
    status: z.enum(['pending', 'paid']),
    date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(formData: FormData) {
    const { customerId, amount, status } = CreateInvoice.parse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    try {
        await sql`
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch (error) {
        return {
            message: 'Database Error: Failed to Create Invoice',
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(id: string, formData: FormData) {
    const { customerId, amount, status } = UpdateInvoice.parse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    const amountInCents = amount * 100;

    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch (error) {
        return {
            message: 'Database Error: Failed to Update Invoice',
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    try {
        await sql`DELETE FROM invoices WHERE id = ${id}`;
        revalidatePath('/dashboard/invoices');
        return { message: "Deleted Invoice" };
    } catch(error) {
        return {
            message: 'Database Error: Failed to Delete Invoice',
        };
    }
}

const CustomerFormSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.any(),
});

const CreateCustomer = CustomerFormSchema.omit({ id: true });

export async function createCustomer(formData: FormData) {
    const { name, email, image } = CreateCustomer.parse({
        name: formData.get('name'),
        email: formData.get('email'),
        image: formData.get('image'),
    });

    const hasImage = typeof image === 'object' && image.size > 0;
    let imageUrl = '/customers/default.png';

    try {
        if (hasImage) {
            const extension = image.name.split('.').pop();
            const filename = slugify(name) + '.' + extension;
            const filePath = `public/customers/${filename}`;
            const imageFile = formData.get('image') as File;
            const blob = await put(filePath, imageFile, {
                access: 'public',
            });
            imageUrl = blob.url;
        }

        await sql`
            INSERT INTO customers (name, email, image_url)
            VALUES (${name}, ${email}, ${imageUrl})
        `;
    } catch (error) {
        console.log(error);
        return {
            message: 'Database Error: Failed to Create Customer',
        };
    }

    revalidatePath('/dashboard/customers');
    redirect('/dashboard/customers');
}


const UpdateCustomer = CustomerFormSchema.omit({ id: true });

export async function updateCustomer(id: string, formData: FormData) {
    const { name, email, image } = UpdateCustomer.parse({
        name: formData.get('name'),
        email: formData.get('email'),
        image: formData.get('image')
    });

    try {
        const hasImage = typeof image === 'object' && image.size > 0;

        if (hasImage) {
            // Upload new image
            const extension = image.name.split('.').pop();
            const newFilename = slugify(name) + '.' + extension;
            const newFilePath = `public/customers/${newFilename}`;
            const imageFile = formData.get('image') as File;
            const blob = await put(newFilePath, imageFile, {
                access: 'public',
            });
            const newImageUrl = blob.url;

            // Delete old image file
            const data = await sql<Customer>`
            SELECT image_url
                FROM customers
                WHERE id = ${id}
            `;

            const imageUrl = data.rows[0].image_url;

            if (imageUrl !== '/customers/default.png') {
                await del(imageUrl);
            }

            await sql`
            UPDATE customers
                SET name = ${name}, email = ${email}, image_url = ${newImageUrl}
                WHERE id = ${id}
            `;
        } else {
            await sql`
            UPDATE customers
                SET name = ${name}, email = ${email}
                WHERE id = ${id}
            `;
        }
    } catch (error) {
        return {
            message: 'Database Error: Failed to Update Customer',
        };
    }

    revalidatePath('/dashboard/customers');
    redirect('/dashboard/customers');
}

export async function deleteCustomer(id: string) {
    try {

        // Delete the image file
        const data = await sql<Customer>`
            SELECT image_url
            FROM customers
            WHERE id = ${id}
        `;
        const imageUrl = data.rows[0].image_url;

        if (imageUrl !== '/customers/default.png') {
            await del(imageUrl);
        }

    } catch(error) {
        console.log(error);
    }

    try {
        await sql`DELETE FROM customers WHERE id = ${id}`;

        // Delete all invoices associated with the customer
        await sql`DELETE FROM invoices WHERE customer_id = ${id}`;

        revalidatePath('/dashboard/customers');
        revalidatePath('/dashboard/invoices');
        return { message: "Deleted Customer" };
    } catch(error) {
        return {
            message: 'Database Error: Failed to Delete Customer',
        };
    }
}
