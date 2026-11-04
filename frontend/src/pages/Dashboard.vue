<template>
    <div class="container-fluid">
        <div class="row">
            <div class="col-12 col-md-4 col-xl-3">
                <div>
                    <router-link to="/compose" class="btn btn-primary mb-3"><font-awesome-icon icon="plus" /> {{ $t("compose") }}</router-link>
                </div>
                <StackList :scrollbar="true" :collapsed="$root.isMobile && !listOpen" @stack-selected="closeStackList">
                    <template v-if="$root.isMobile" #toggle>
                        <button
                            class="btn btn-normal rounded-pill stack-toggle" type="button"
                            :aria-label="$t('stacks')" :aria-expanded="listOpen" aria-controls="dashboard-stacks"
                            @click="listOpen = !listOpen"
                        >
                            <font-awesome-icon :icon="listOpen ? 'chevron-up' : 'chevron-down'" />
                            <span v-if="!listOpen" class="ms-2">{{ $t("stacks") }}</span>
                        </button>
                    </template>
                </StackList>
            </div>

            <div ref="container" class="col-12 col-md-8 col-xl-9 mb-3 dashboard-content" tabindex="-1">
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </div>
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0,
            listOpen: this.$route.path === "/",
        };
    },
    watch: {
        "$route.fullPath"() {
            this.listOpen = this.$route.path === "/";
            if (this.$root.isMobile && !this.listOpen) {
                this.$nextTick(() => {
                    this.$refs.container.scrollIntoView({ block: "start" });
                    this.$refs.container.focus({ preventScroll: true });
                });
            }
        },
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
    methods: {
        /** Close the picker even when selecting the already active stack. */
        closeStackList() {
            if (this.$root.isMobile) {
                this.listOpen = false;
                this.$nextTick(() => this.$refs.container.scrollIntoView({ block: "start" }));
            }
        },
    },
};
</script>

<style lang="scss" scoped>
.container-fluid {
    width: 98%;
}

.stack-toggle {
    min-width: 44px;
    min-height: 36px;
}

.dashboard-content:focus {
    outline: none;
}
</style>
