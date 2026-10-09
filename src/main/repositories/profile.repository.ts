import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export type ProfileInput = Partial<
  Record<
    | 'name'
    | 'phone'
    | 'email'
    | 'gender'
    | 'birthday'
    | 'hometown'
    | 'currentCity'
    | 'expectedCity'
    | 'expectedSalary'
    | 'documentType'
    | 'documentNumber'
    | 'ethnicity'
    | 'emergencyContactName'
    | 'emergencyContactPhone'
    | 'mailingAddress',
    string | null
  >
>
export function createProfileRepository(db: Database.Database) {
  return {
    get() {
      return db
        .prepare(
          "SELECT id,name,phone,email,gender,birthday,hometown,current_city AS currentCity,expected_city AS expectedCity,expected_salary AS expectedSalary,document_type AS documentType,document_number AS documentNumber,ethnicity,emergency_contact_name AS emergencyContactName,emergency_contact_phone AS emergencyContactPhone,mailing_address AS mailingAddress,updated_at AS updatedAt FROM profile WHERE id='default'",
        )
        .get() as ({ id: 'default'; updatedAt: string } & ProfileInput) | undefined
    },
    save(input: ProfileInput) {
      const columns = {
        name: 'name',
        phone: 'phone',
        email: 'email',
        gender: 'gender',
        birthday: 'birthday',
        hometown: 'hometown',
        currentCity: 'current_city',
        expectedCity: 'expected_city',
        expectedSalary: 'expected_salary',
        documentType: 'document_type',
        documentNumber: 'document_number',
        ethnicity: 'ethnicity',
        emergencyContactName: 'emergency_contact_name',
        emergencyContactPhone: 'emergency_contact_phone',
        mailingAddress: 'mailing_address',
      } as const
      const values: Record<string, string | null> = { id: 'default', updatedAt: new Date().toISOString() }
      const names: string[] = []
      for (const key of Object.keys(columns) as (keyof typeof columns)[])
        if (key in input) {
          names.push(columns[key])
          values[key] = input[key] ?? null
        }
      if (!names.length) {
        db.prepare("INSERT INTO profile(id,updated_at) VALUES ('default',?) ON CONFLICT(id) DO NOTHING").run(
          values.updatedAt,
        )
        return this.get()
      }
      const insertColumns = ['id', ...names, 'updated_at']
      const insertValues = [
        '@id',
        ...names.map((name) => `@${Object.entries(columns).find(([, column]) => column === name)?.[0]}`),
        '@updatedAt',
      ]
      const updates = names.map((name) => `${name}=excluded.${name}`).concat('updated_at=excluded.updated_at')
      db.prepare(
        `INSERT INTO profile(${insertColumns.join(',')}) VALUES (${insertValues.join(',')}) ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`,
      ).run(values)
      return this.get()
    },
    addEducation(input: {
      school: string
      degree?: string | null
      major?: string | null
      startDate?: string | null
      endDate?: string | null
      notes?: string | null
      sortOrder?: number
    }) {
      const item = {
        id: randomUUID(),
        ...input,
        degree: input.degree ?? null,
        major: input.major ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder ?? 0,
      }
      db.prepare(
        'INSERT INTO education(id,school,degree,major,start_date,end_date,notes,sort_order) VALUES (@id,@school,@degree,@major,@startDate,@endDate,@notes,@sortOrder)',
      ).run(item)
      return item
    },
    updateEducation(input: {
      id: string
      school?: string
      degree?: string | null
      major?: string | null
      startDate?: string | null
      endDate?: string | null
      notes?: string | null
      sortOrder?: number
    }) {
      updateRow(
        db,
        'education',
        {
          school: 'school',
          degree: 'degree',
          major: 'major',
          startDate: 'start_date',
          endDate: 'end_date',
          notes: 'notes',
          sortOrder: 'sort_order',
        },
        input,
      )
      return db
        .prepare(
          'SELECT id,school,degree,major,start_date AS startDate,end_date AS endDate,notes,sort_order AS sortOrder FROM education WHERE id=?',
        )
        .get(input.id)
    },
    deleteEducation(id: string) {
      db.prepare('DELETE FROM education WHERE id=?').run(id)
    },
    listEducation() {
      return db
        .prepare(
          'SELECT id,school,degree,major,start_date AS startDate,end_date AS endDate,notes,sort_order AS sortOrder FROM education ORDER BY sort_order,id',
        )
        .all()
    },
    addInternship(input: {
      employer: string
      role?: string | null
      startDate?: string | null
      endDate?: string | null
      description?: string | null
      sortOrder?: number
    }) {
      const item = {
        id: randomUUID(),
        ...input,
        role: input.role ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      }
      db.prepare(
        'INSERT INTO internships(id,employer,role,start_date,end_date,description,sort_order) VALUES (@id,@employer,@role,@startDate,@endDate,@description,@sortOrder)',
      ).run(item)
      return item
    },
    updateInternship(input: {
      id: string
      employer?: string
      role?: string | null
      startDate?: string | null
      endDate?: string | null
      description?: string | null
      sortOrder?: number
    }) {
      updateRow(
        db,
        'internships',
        {
          employer: 'employer',
          role: 'role',
          startDate: 'start_date',
          endDate: 'end_date',
          description: 'description',
          sortOrder: 'sort_order',
        },
        input,
      )
      return db
        .prepare(
          'SELECT id,employer,role,start_date AS startDate,end_date AS endDate,description,sort_order AS sortOrder FROM internships WHERE id=?',
        )
        .get(input.id)
    },
    deleteInternship(id: string) {
      db.prepare('DELETE FROM internships WHERE id=?').run(id)
    },
    listInternships() {
      return db
        .prepare(
          'SELECT id,employer,role,start_date AS startDate,end_date AS endDate,description,sort_order AS sortOrder FROM internships ORDER BY sort_order,id',
        )
        .all()
    },
    addProject(input: {
      name: string
      role?: string | null
      startDate?: string | null
      endDate?: string | null
      description?: string | null
      sortOrder?: number
    }) {
      const item = {
        id: randomUUID(),
        ...input,
        role: input.role ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      }
      db.prepare(
        'INSERT INTO projects(id,name,role,start_date,end_date,description,sort_order) VALUES (@id,@name,@role,@startDate,@endDate,@description,@sortOrder)',
      ).run(item)
      return item
    },
    updateProject(input: {
      id: string
      name?: string
      role?: string | null
      startDate?: string | null
      endDate?: string | null
      description?: string | null
      sortOrder?: number
    }) {
      updateRow(
        db,
        'projects',
        {
          name: 'name',
          role: 'role',
          startDate: 'start_date',
          endDate: 'end_date',
          description: 'description',
          sortOrder: 'sort_order',
        },
        input,
      )
      return db
        .prepare(
          'SELECT id,name,role,start_date AS startDate,end_date AS endDate,description,sort_order AS sortOrder FROM projects WHERE id=?',
        )
        .get(input.id)
    },
    deleteProject(id: string) {
      db.prepare('DELETE FROM projects WHERE id=?').run(id)
    },
    listProjects() {
      return db
        .prepare(
          'SELECT id,name,role,start_date AS startDate,end_date AS endDate,description,sort_order AS sortOrder FROM projects ORDER BY sort_order,id',
        )
        .all()
    },
    saveCustomField(input: { fieldKey: string; label: string; value?: string | null }) {
      const item = {
        id: randomUUID(),
        ...input,
        value: input.value ?? null,
        updatedAt: new Date().toISOString(),
      }
      db.prepare(
        `INSERT INTO custom_fields(id,field_key,label,value,updated_at) VALUES (@id,@fieldKey,@label,@value,@updatedAt)
        ON CONFLICT(field_key) DO UPDATE SET label=excluded.label,value=excluded.value,updated_at=excluded.updated_at`,
      ).run(item)
      return db
        .prepare(
          'SELECT id,field_key AS fieldKey,label,value,updated_at AS updatedAt FROM custom_fields WHERE field_key=?',
        )
        .get(input.fieldKey)
    },
    listCustomFields() {
      return db
        .prepare(
          'SELECT id,field_key AS fieldKey,label,value,updated_at AS updatedAt FROM custom_fields ORDER BY label',
        )
        .all()
    },
    deleteCustomField(fieldKey: string) {
      db.prepare('DELETE FROM custom_fields WHERE field_key=?').run(fieldKey)
    },
  }
}

function updateRow(
  db: Database.Database,
  table: 'education' | 'projects' | 'internships',
  columns: Record<string, string>,
  input: { id: string } & Record<string, unknown>,
) {
  const params: Record<string, unknown> = { id: input.id }
  const assignments: string[] = []
  for (const [key, column] of Object.entries(columns))
    if (key in input && input[key] !== undefined) {
      assignments.push(`${column}=@${key}`)
      params[key] = input[key]
    }
  if (assignments.length) db.prepare(`UPDATE ${table} SET ${assignments.join(',')} WHERE id=@id`).run(params)
}
