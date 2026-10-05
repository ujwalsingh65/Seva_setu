/**
 * Design system showcase — internal reference page for the reusable
 * SevaSetu UI components. Not an application page.
 */
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Caption,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
  FormField,
  Heading,
  Input,
  Label,
  Modal,
  NavBar,
  PageLoader,
  Select,
  Skeleton,
  SkeletonCard,
  Spinner,
  Text,
  Textarea,
} from '../components/ui';
import {
  Calendar,
  CalendarPlus,
  ChevronDown,
  Clock,
  Inbox,
  LogOut,
  MapPin,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserCircle,
} from 'lucide-react';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <Heading level={2}>{title}</Heading>
        {description && <Text>{description}</Text>}
      </div>
      {children}
    </section>
  );
}

export function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);

  return (
    <div className="min-h-screen bg-brand-background">
      <NavBar
        items={[
          { label: 'Overview', to: '/design-system', icon: Sparkles },
          { label: 'Events', to: '/design-system', icon: Calendar },
        ]}
        actions={
          <>
            <Dropdown
              align="end"
              label="Account"
              trigger={
                <Button variant="ghost" size="sm" leadingIcon={UserCircle}>
                  Account <ChevronDown className="h-4 w-4" />
                </Button>
              }
            >
              <DropdownLabel>Volunteer</DropdownLabel>
              <DropdownItem icon={UserCircle}>Profile</DropdownItem>
              <DropdownItem icon={Settings}>Preferences</DropdownItem>
              <DropdownDivider />
              <DropdownItem icon={LogOut} tone="danger">
                Sign out
              </DropdownItem>
            </Dropdown>
            <Button size="sm">Get started</Button>
          </>
        }
      />

      <main className="ds-page flex flex-col gap-16 py-12">
        <header className="max-w-2xl">
          <Heading level={1}>SevaSetu Design System</Heading>
          <Text>
            Reusable components for all SevaSetu surfaces — volunteer, NGO, and admin. Built on the brand
            palette, Inter typography, and the spacing and radius scales from the frontend specification.
          </Text>
        </header>

        <Section title="Typography" description="Clamp-based responsive scale: H1 32–48, H2 24–32, H3 18–22, Body 14–16, Small 12–14.">
          <div className="space-y-3 rounded-large border border-brand-border bg-brand-surface p-6 shadow-card">
            <Heading level={1}>Heading 1 — Community impact</Heading>
            <Heading level={2}>Heading 2 — Find your next event</Heading>
            <Heading level={3}>Heading 3 — Upcoming shifts</Heading>
            <Text size="body" tone="default">
              Body default — Volunteers discover events, apply, and track attendance in one place.
            </Text>
            <Text>Body secondary — the default tone for supporting copy.</Text>
            <Text size="small" tone="muted">
              Small muted — metadata, timestamps, and helper notes.
            </Text>
            <div>
              <Label required>Email address</Label>
              <Caption>Labels introduce inputs; captions annotate them.</Caption>
            </div>
          </div>
        </Section>

        <Section title="Buttons" description="Five variants, three sizes, loading and icon-only states.">
          <Card>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="emergency" leadingIcon={Sparkles}>
                  Emergency
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button loading>Saving</Button>
                <Button disabled>Disabled</Button>
                <Button leadingIcon={Search} trailingIcon={ChevronDown}>
                  With icons
                </Button>
                <Button aria-label="Create event" leadingIcon={CalendarPlus} />
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Badges" description="Status is always text plus optional dot — never color alone.">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge variant="success" dot>
                Accepted
              </Badge>
              <Badge variant="warning" dot>
                Waitlisted
              </Badge>
              <Badge variant="error" dot>
                Rejected
              </Badge>
              <Badge variant="info" dot>
                In progress
              </Badge>
              <Badge variant="neutral">Draft</Badge>
              <Badge variant="success" size="sm">
                Attended
              </Badge>
            </CardContent>
          </Card>
        </Section>

        <Section title="Cards">
          <div className="grid gap-6 md:grid-cols-2">
            <Card hoverable>
              <CardHeader
                icon={Calendar}
                action={
                  <Badge variant="info" dot>
                    Published
                  </Badge>
                }
              >
                <CardTitle>Beach Cleanup Drive</CardTitle>
                <CardDescription>Saturday, Oct 10 · 9:00 AM – 1:00 PM</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-small text-brand-text-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> Versova Beach
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> 4 hours
                  </span>
                </div>
              </CardContent>
              <CardFooter>
                <Caption>12 of 40 spots filled</Caption>
                <Button size="sm">Apply</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader icon={Inbox}>
                <CardTitle>Plain card</CardTitle>
                <CardDescription>No hover elevation, footer omitted.</CardDescription>
              </CardHeader>
              <CardContent>
                <Text>Cards use a 16px radius, 1px border, and the soft card shadow from the spec.</Text>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Inputs" description="1px border, 8px radius, visible green focus ring, inline validation.">
          <Card>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <Input label="Full name" placeholder="Priya Sharma" hint="Shown on your volunteer profile." required />
              <Input
                label="Email"
                type="email"
                placeholder="priya@example.com"
                error="Enter a valid email address."
                defaultValue="priya@@example"
              />
              <Input label="Search events" placeholder="Search by title or cause" leadingIcon={<Search className="h-4 w-4" />} />
              <Select
                label="Availability"
                placeholder="Select weekly window"
                hint="Used by matching to propose shifts."
                options={[
                  { value: 'mon-am', label: 'Monday mornings' },
                  { value: 'sat-all', label: 'Saturdays, all day' },
                  { value: 'sun-pm', label: 'Sunday afternoons', disabled: true },
                ]}
              />
              <div className="md:col-span-2">
                <Textarea label="Why do you want to volunteer?" placeholder="Tell organizers a little about yourself…" />
              </div>
              <div className="md:col-span-2">
                <Input label="Disabled state" placeholder="Not editable" disabled />
              </div>
              <FormField label="Render-prop field" hint="Use FormField when composing custom controls.">
                {(field) => <Input {...field} placeholder="Composed with FormField" />}
              </FormField>
            </CardContent>
          </Card>
        </Section>

        <Section title="Alerts" description="Dismissible inline feedback; the warning sample below can be closed.">
          <div className="space-y-4">
            <Alert variant="info" title="Heads up">
              Your application to Beach Cleanup Drive is pending organizer review.
            </Alert>
            <Alert variant="success" title="Application accepted">
              See you on Saturday — check-in opens 30 minutes before your shift.
            </Alert>
            {alertVisible && (
              <Alert variant="warning" title="Certification expiring" onClose={() => setAlertVisible(false)}>
                Your first-aid certificate expires in 14 days.
              </Alert>
            )}
            <Alert variant="error" title="Check-in failed">
              Location could not be verified. Enable location access and try again.
            </Alert>
          </div>
        </Section>

        <Section title="Dropdown" description="Click-outside and Escape close the menu.">
          <Card>
            <CardContent className="flex flex-wrap gap-6">
              <Dropdown
                label="Event actions"
                trigger={
                  <Button variant="secondary" trailingIcon={ChevronDown}>
                    Event actions
                  </Button>
                }
              >
                <DropdownItem icon={UserCircle}>View volunteers</DropdownItem>
                <DropdownItem icon={Settings}>Manage roster</DropdownItem>
                <DropdownDivider />
                <DropdownItem icon={Trash2} tone="danger">
                  Cancel event
                </DropdownItem>
              </Dropdown>
              <Dropdown
                align="start"
                label="Start-aligned"
                trigger={
                  <Button variant="ghost" trailingIcon={ChevronDown}>
                    Start-aligned
                  </Button>
                }
              >
                <DropdownItem>Option one</DropdownItem>
                <DropdownItem>Option two</DropdownItem>
              </Dropdown>
            </CardContent>
          </Card>
        </Section>

        <Section title="Modal">
          <Card>
            <CardContent>
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            </CardContent>
          </Card>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            icon={CalendarPlus}
            title="Create event"
            description="Draft events stay private until you publish them."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Create event</Button>
              </>
            }
          >
            <div className="space-y-4">
              <Input label="Event title" placeholder="Beach Cleanup Drive" required />
              <Select
                label="Visibility"
                options={[
                  { value: 'public', label: 'Public — any volunteer can apply' },
                  { value: 'ngo_only', label: 'NGO only — affiliates only' },
                ]}
              />
            </div>
          </Modal>
        </Section>

        <Section title="Loading states">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spinners</CardTitle>
                <CardDescription>role=status with an accessible label.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-5">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
                <Spinner size="md" className="border-white border-t-transparent" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Skeletons</CardTitle>
                <CardDescription>Shimmer placeholders for content still loading.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton variant="circular" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-1/2" />
                    <Skeleton className="w-1/3" />
                  </div>
                </div>
                <Skeleton variant="rectangular" className="h-16" />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <SkeletonCard lines={3} />
            <Card>
              <CardHeader>
                <CardTitle>Page loader</CardTitle>
                <CardDescription>Full-block loading state for route transitions.</CardDescription>
              </CardHeader>
              <CardContent>
                <PageLoader label="Loading dashboard" />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Empty and error states">
          <div className="grid gap-6 md:grid-cols-2">
            <EmptyState
              icon={Inbox}
              title="No applications yet"
              description="When you apply to events, your applications and their statuses will appear here."
              action={<Button size="sm">Browse events</Button>}
            />
            <ErrorState onRetry={() => undefined} />
          </div>
        </Section>
      </main>
    </div>
  );
}
