# Statut des stacks avec des conteneurs terminés

Une stack mêlant uniquement des conteneurs `running` et `exited` est affichée
active si au moins un conteneur tourne et si tous les conteneurs terminés ont
explicitement un code de sortie 0. Cela permet notamment à TRK de rester active
avec `app` et `db` en fonctionnement, et `migrate` et `bootstrap-auth` terminés.

C'est une règle d'affichage : une sortie 0 ne prouve pas qu'un service est une
tâche d'initialisation. Un service permanent arrêté proprement peut donc être
considéré comme acceptable tant que d'autres conteneurs tournent. Cette règle
ne vérifie ni le rôle du service, ni sa nécessité pour le fonctionnement de
l'application. Elle sert aussi au contrôle existant qui décide de relancer une
stack active après le téléchargement des images (`Stack.update`).

Une sortie non nulle ou inconnue conserve le statut arrêté. Une stack sans
conteneur en fonctionnement n'est jamais promue active. Les autres combinaisons
(`created`, `paused`, `restarting`, `dead`, etc.) gardent leur conversion existante.
Les indicateurs `healthy`, `unhealthy` et `starting` restent calculés séparément :
une stack active n'est pas nécessairement saine.

`getStackList` et `getStatusList` partagent la même résolution. La vue détaillée
lit le statut de la liste globale ; `updateStatus` utilise `getStatusList`.
Une actualisation ne fait aucun appel supplémentaire pour les états ordinaires,
et au plus un `docker ps --all` pour l'ensemble des projets mixtes. La lecture
inclut les conteneurs terminés et utilise le label de projet Compose, sans
nécessiter de fichier Compose local (stacks non gérées comprises).

Docker ps fournit le code dans le texte `Exited (0)` : seuls ce format explicite
et un état `exited` sont acceptés. Toute erreur Docker, ligne invalide, sortie
vide ou divergence des comptes avec `compose ls` conserve le statut initial.
Les deux lectures ne sont pas atomiques ; une transition peut donc retarder
l'affichage actif jusqu'à l'actualisation suivante. Aucun cache supplémentaire
n'est introduit.

Référence examinée le 10 novembre 2026 :
[PR upstream #950](https://github.com/louislam/dockge/pull/950), ouverte et non
fusionnée lors de la consultation. Cette adaptation mutualise la lecture Docker,
refuse les lignes illisibles et les états supplémentaires, et compare les comptes
pour éviter une promotion à partir d'un résultat incomplet.

Vérification : `npm run test:stack-status` (Docker simulé, sans toucher aux stacks).
La construction locale exécute également cette suite. Voir
[les commandes de construction et de déploiement](deploiement-local.md).
