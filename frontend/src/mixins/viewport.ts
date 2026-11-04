import { defineComponent } from "vue";

const mobileQuery = window.matchMedia("(max-width: 767.98px)");

export default defineComponent({
    data() {
        return { isMobile: mobileQuery.matches };
    },
    mounted() {
        mobileQuery.addEventListener("change", this.updateMobile);
    },
    beforeUnmount() {
        mobileQuery.removeEventListener("change", this.updateMobile);
    },
    methods: {
        /** Update layout when the viewport crosses the Bootstrap breakpoint. */
        updateMobile(event: MediaQueryListEvent) {
            this.isMobile = event.matches;
        },
    },
});
