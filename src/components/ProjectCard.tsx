import Link from "next/link"
import type { Project } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type ProjectCardProps = {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/project/${project.id}`}>
      <Card className="hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 h-full flex flex-col border-t-4 border-t-[#1EA7F4] bg-white/90">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="font-headline text-xl text-[#142E88]">{project.name}</CardTitle>
              <CardDescription className="font-body text-sm">{project.wbs}</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-[#1EA7F4]/10 text-[#142E88]">{project.deliveryMethod}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-body">{project.status}</Badge>
            <Badge variant="outline" className="font-body">Phase {project.currentPhase}</Badge>
          </div>
          {project.itDisciplines && project.itDisciplines.length > 0 && (
            <p className="font-body text-xs uppercase tracking-[0.18em] text-[#885BCE]">Disciplines: {project.itDisciplines.join(' · ')}</p>
          )}
        </CardContent>
        <CardFooter className="border-t pt-4 text-xs text-muted-foreground uppercase tracking-[0.2em]">
          AviaTrack program control
        </CardFooter>
      </Card>
    </Link>
  )
}
