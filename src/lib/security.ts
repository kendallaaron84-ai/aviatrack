// File: src/lib/security.ts
export type UserRole = 
  | 'PROGRAM_MANAGER' 
  | 'PORTFOLIO_MANAGER' 
  | 'PROJECT_MANAGER' 
  | 'FIELD_ENGINEER'
  | 'IT_PHYSICAL_SECURITY'  // 🟢 New Segmentation Track
  | 'NETWORK_ENGINEER';     // 🟢 New Segmentation Track

export interface UserPermissions {
  role: UserRole;
  title: string;
  canEditDashboard: boolean;
  canReviewObservations: boolean;
  canEditFinancials: boolean;
  canAddComments: boolean;
}

export const USER_REGISTRY: Record<string, UserPermissions> = {
  "kendallaaron84@gmail.com": {
    role: "PROGRAM_MANAGER",
    title: "Program Manager",
    canEditDashboard: true,
    canReviewObservations: true,
    canEditFinancials: true,
    canAddComments: true
  },
  // 🟢 ADD YOUR ENTERPRISE ADDRESS HERE FOR TESTING ROLE PERMISSIONS
  "kendall.aaron@sanantonio.gov": {
    role: "PROJECT_MANAGER", // Switch this to 'FIELD_ENGINEER' when you want to test the hidden menu lock!
    title: "Program Manager (CoSA)",
    canEditDashboard: true,
    canReviewObservations: true,
    canEditFinancials: true,
    canAddComments: true
  },
  "kassaundra.salinas@sanantonio.gov": {
    role: "PROJECT_MANAGER",
    title: "Project Manager",
    canEditDashboard: true,
    canReviewObservations: true,
    canEditFinancials: true,
    canAddComments: true
  },
  "lejandro.ligeralde@sanantonio.gov": {
    role: "PROJECT_MANAGER",
    title: "Project Manager",
    canEditDashboard: true,
    canReviewObservations: true,
    canEditFinancials: true,
    canAddComments: true
  },
  "ytevia.watts@sanantonio.gov": {
    role: "PORTFOLIO_MANAGER",
    title: "Portfolio Manager",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: true 
  },
  "john.perez2@sanantonio.gov": {
    role: "IT_PHYSICAL_SECURITY", // 🟢 Segmented
    title: "IT Physical Security Specialist",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: false
  },
  "ricardo.briseno@sanantonio.gov": {
    role: "NETWORK_ENGINEER", // 🟢 Segmented
    title: "Network Engineer",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: false
  },
  "andrew.jafee@sanantonio.gov": {
    role: "NETWORK_ENGINEER", // 🟢 Segmented (Andrew Jaffee Sr. IT Manager Network)
    title: "Sr. IT Network Manager",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: false
  }
};

export const getPermissions = (email: string | null | undefined): UserPermissions => {
  return email ? (USER_REGISTRY[email] || {
    role: "FIELD_ENGINEER",
    title: "Field Staff",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: false
  }) : {
    role: "FIELD_ENGINEER",
    title: "Field Staff",
    canEditDashboard: false,
    canReviewObservations: false,
    canEditFinancials: false,
    canAddComments: false
  };
};