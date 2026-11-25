export interface StackUpdateCheck {
    name: string;
    available: string[];
    unverified: string[];
    incomplete?: boolean;
}
