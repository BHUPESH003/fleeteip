# Frontend conventions: forms, API errors, enums

Reference implementation: `apps/web/app/(app)/machines/EditMachineDialog.tsx`.

## Forms: `useForm` (apps/web/lib/form.ts)

One hook per form. It owns values, touched/tried state, server errors, the
banner, busy and offline. A form never has its own `try/catch`, `setBusy`,
`instanceof ApiError` or `err.status === 409`.

```tsx
const form = useForm({
  schema,                                   // zod: raw input strings -> request body
  initial: initialValues(record),
  failTitle: `${ref} wasn't saved`,         // banner title when the save fails
  conflicts: { assetCode: "That asset code is already used." }, // optional 409 copy per field
});

const save = form.submit(async (body) => {
  const saved = await apiClient.saveThing(orgId, body);
  toast.success({ title: `${saved.ref} saved` });
  onSaved(saved);
});

<Dialog onSubmit={save} ...>
  {form.banner && <FormBanner tone="error" title={form.banner.title}>{form.banner.body}</FormBanner>}
  <Input label="Asset code" {...form.field("assetCode")} />
  <Button type="submit" busy={form.busy} disabled={!form.online}>Save</Button>
</Dialog>
```

- **Rules live in the schema, in the words users read.** Write
  `z.string().trim().min(1, "Enter the registration number.")`, not an
  if-chain. Rules that depend on the record go in a small factory:
  `editMachineSchema(machine)`, memoised with `useMemo`.
- **Transform in the schema.** `.transform()` turns input strings into the
  request body, for example numbers or "send only what changed". The save
  function receives a body that's ready to send.
- **Contract schemas.** If `@fleetip/contracts` already has the request
  schema and its default messages read well, reuse it. Otherwise write the
  form schema next to the form. The API still validates with the contract
  schema.
- **Non-string fields** (checkbox, select-with-object, date pickers): use
  `form.set(name, value)` and `form.errors[name]`.
- **Reopening a dialog on another record:** call
  `useEffect(() => { if (open) form.reset(initialValues(record)); }, [open, record, form.reset])`.

## One-click writes: `useAction`

For confirms, status transitions and buttons that write without a form:

```tsx
const action = useAction();
const complete = () =>
  action.run(() => apiClient.completeRental(orgId, rental.id), {
    failTitle: `${ref} wasn't completed`,
    success: () => ({ title: `${ref} completed` }),
    onDone: (updated) => { onChanged(updated); onClose(); },
  });
// action.busy, action.banner ({ title, body } | null)
```

## How API errors reach the screen

| Response | Shown as | Where it's decided |
|---|---|---|
| 400 with `issues[]` | Message under each field; issues with no path go in the banner | `toFormFailure` |
| 409 with `field` | Under that field (copy from `conflicts`, else the translated server text) | `toFormFailure` |
| 409 without `field`, 403, 404, 5xx | Banner: `failTitle` plus a plain-language body | `describeError` |
| Offline (status 0) | Banner, and the save is blocked before it's sent | `useForm` / `useAction` |
| Page load failure | `PageLoadError` / `ForbiddenPage` (`components/PageStates.tsx`) | `useLoad` |
| Background refresh failure | Warning toast; the loaded data stays on screen | `useLoad` |

The API sends `{ error: { code, message, issues?: [{ path, message }], field? } }`.
`apps/api/src/shared/validate.ts` fills `issues`. `new ConflictError(message, "fieldName")`
fills `field`. When a new unique constraint or conflict maps to one field, pass the field.

## Enums: never compare against a bare string

Each named contract enum exports a value object with the same name as its type:

```ts
import { RentalStatus } from "@fleetip/contracts/rental";

if (rental.status === RentalStatus.active) ...          // value
function label(status: RentalStatus) ...                // type
const OPEN: RentalStatus[] = [RentalStatus.confirmed, RentalStatus.active];
```

- Add new enums to contracts as `z.enum([...])` with
  `export type X = z.infer<typeof xSchema>` and `export const X = xSchema.enum`.
- Don't use the TypeScript `enum` keyword. It creates a second runtime value that
  the zod schema doesn't know about.
- Exceptions:
  - Permission codes: `hasPermission("rental.manage")` is already typed.
  - Discriminated-union tags local to one file.
  - `switch` cases on a typed union, where TypeScript already checks exhaustiveness.

## Other shared pieces

- `OFFLINE_HINT` comes from `lib/errors.ts`. Never copy the sentence into a file.
- Status chips: `<Status domain="rental" value={...} />` (`lib/status.tsx`). No local status maps.
- Formatting: `lib/format.ts` (dates, money, `rentalRef`, `requirementRef`).
