<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" class="item" @click="$emit('selected')">
        <Uptime :stack="stack" :fixed-width="true" class="me-2" />
        <span class="title">{{ stackName }}</span>
        <span v-if="updateBadges.length" class="update-badges">
            <span v-for="badge in updateBadges" :key="badge.icon" class="update-badge" :class="badge.color" :title="badge.label">
                <font-awesome-icon :icon="badge.icon" aria-hidden="true" />
                <span class="visually-hidden">{{ badge.label }}</span>
            </span>
        </span>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";

export default {
    components: {
        Uptime
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        updateCheck: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    emits: [ "selected" ],
    data() {
        return {
            isCollapsed: true,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
        },
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        stackName() {
            return this.stack.name;
        },
        updateBadges() {
            if (!this.updateCheck) {
                return [];
            }
            const { available, incomplete, unverified } = this.updateCheck;
            const badges = [];
            if (available?.length) {
                badges.push({
                    icon: "cloud-arrow-down",
                    color: "bg-primary text-dark",
                    label: `${this.$t("stackUpdateAvailable")} (${available.join(", ")})`,
                });
            }
            if (incomplete || unverified?.length) {
                const label = this.$t("stackUpdateCheckIncomplete");
                badges.push({
                    icon: "exclamation-circle",
                    color: "bg-warning text-dark",
                    label: unverified?.length ? `${label} (${unverified.join(", ")})` : label,
                });
            }
            if (!badges.length) {
                badges.push({
                    icon: "check",
                    color: "bg-secondary text-white",
                    label: this.$t("stackUpToDate"),
                });
            }
            return badges;
        },
    },
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
        }
    },
    beforeMount() {

    },
    methods: {
        /**
         * Changes the collapsed value of the current stack and saves
         * it to local storage
         * @returns {void}
         */
        changeCollapsed() {
            this.isCollapsed = !this.isCollapsed;

            // Save collapsed value into local storage
            let storage = window.localStorage.getItem("stackCollapsed");
            let storageObject = {};
            if (storage !== null) {
                storageObject = JSON.parse(storage);
            }
            storageObject[`stack_${this.stack.id}`] = this.isCollapsed;

            window.localStorage.setItem("stackCollapsed", JSON.stringify(storageObject));
        },

        /**
         * Toggle selection of stack
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.stack.id)) {
                this.deselect(this.stack.id);
            } else {
                this.select(this.stack.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@use "../styles/vars.scss" as *;

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.item {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: 52px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 5px 8px;
    &.disabled {
        opacity: 0.3;
    }
    &:hover {
        background-color: $highlight-white;
    }
    &.active {
        background-color: #cdf8f4;
    }
    .title {
        margin-top: -4px;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .endpoint {
        font-size: 12px;
        color: $dark-font-color3;
    }
}

.update-badges {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    margin-inline-start: auto;
    padding-inline-start: 6px;
}

.update-badge {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 12px;
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

.dim {
    opacity: 0.5;
}

</style>
