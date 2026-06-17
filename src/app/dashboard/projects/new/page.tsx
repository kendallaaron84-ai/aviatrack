"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/PageHeader"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useFirestore, addDocumentNonBlocking } from "@/firebase"
import { collection } from "firebase/firestore"
import { ITDiscipline } from "@/lib/types"

const itDisciplines: { id: ITDiscipline; label: string }[] = [
  { id: "Networking", label: "Networking" },
  { id: "Cabling", label: "Cabling" },
  { id: "Security Systems", label: "Security Systems" },
  { id: "Audiovisual", label: "Audiovisual" },
  { id: "DAS/Cellular", label: "DAS/Cellular" },
]

const formSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters."),
  wbs: z.string().min(2, "WBS code is required."),
  deliveryMethod: z.enum(["CMAR", "DB", "DBB"]),
  itDisciplines: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one IT discipline.",
  }),
  glCodeComputerEquipmentOver5k: z.string().optional(),
  glCodeComputerEquipmentUnder5k: z.string().optional(),
  glCodeNonComputerEquipmentOver5k: z.string().optional(),
  glCodeNonComputerEquipmentUnder5k: z.string().optional(),
  glCodeInstallation: z.string().optional(),
})

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
  const firestore = useFirestore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      wbs: "",
      itDisciplines: [],
      glCodeComputerEquipmentOver5k: "",
      glCodeComputerEquipmentUnder5k: "",
      glCodeNonComputerEquipmentOver5k: "",
      glCodeNonComputerEquipmentUnder5k: "",
      glCodeInstallation: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore) {
      toast({
        title: "Error",
        description: "Firestore is not initialized.",
        variant: "destructive",
      })
      return
    }

    const projectsCol = collection(firestore, "projects")
    const newProject = {
      ...values,
      status: "Intake",
      currentPhase: "0% CD",
      changeNarrative: "",
    };
    
    addDocumentNonBlocking(projectsCol, newProject)

    toast({
      title: "Project Created",
      description: `The project "${values.name}" has been successfully created.`,
    })
    router.push("/dashboard")
  }

  return (
    <>
      <PageHeader
        title="Create New Project"
        description="Fill in the details below to add a new project to AviaTrack."
      />
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Project Intake</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Terminal 4 Wi-Fi Upgrade" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="wbs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WBS Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., A-385-22-T4-WIFI" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="deliveryMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a delivery method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CMAR">CMAR (Construction Manager at Risk)</SelectItem>
                          <SelectItem value="DB">DB (Design-Build)</SelectItem>
                          <SelectItem value="DBB">DBB (Design-Bid-Build)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="itDisciplines"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">IT Disciplines</FormLabel>
                      <FormDescription>
                        Select all applicable IT disciplines for this project.
                      </FormDescription>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      {itDisciplines.map((item) => (
                        <FormField
                          key={item.id}
                          control={form.control}
                          name="itDisciplines"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={item.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, item.id])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== item.id
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {item.label}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

               <Card>
                <CardHeader>
                    <CardTitle>GL Codes</CardTitle>
                    <CardDescription>Provide the General Ledger codes for budget tracking.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                    <FormField
                      control={form.control}
                      name="glCodeComputerEquipmentOver5k"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Computer Equipment over $5,000</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter GL code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="glCodeComputerEquipmentUnder5k"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Computer Equipment under $5,000</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter GL code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="glCodeNonComputerEquipmentOver5k"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Non-computer equipment over $5,000</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter GL code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="glCodeNonComputerEquipmentUnder5k"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Non-computer equipment under $5,000</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter GL code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="glCodeInstallation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Installation (PM, Labor)</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter GL code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit">Create Project</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  )
}
