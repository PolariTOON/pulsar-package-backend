// This is our secondary integration test.
// Due to the difficulty in testing some aspects as full integration tests,
// namely tests for publishing and updating packages (due to the varried responses expected by github)
// We will use this to tests these aspects directly against the DB. Being able
// to provide whatever values we wish to these functions. Just to ensure that everything works as expected.
// Or at the very least that if there is a failure within these, it will not result in
// bad data being entered into the database in production.

let database;

jest.setTimeout(300000);

beforeAll(async () => {
  let db_url = process.env.DATABASE_URL;
  // This returns: postgres://test-user@localhost:5432/test-db
  let db_url_reg = /postgres:\/\/([\/\S]+)@([\/\S]+):(\d+)\/([\/\S]+)/;
  let db_url_parsed = db_url_reg.exec(db_url);

  // set the parsed URL as proper env for the db module
  process.env.DB_HOST = db_url_parsed[2];
  process.env.DB_USER = db_url_parsed[1];
  process.env.DB_DB = db_url_parsed[4];
  process.env.DB_PORT = db_url_parsed[3];

  database = require("../database.js");
});

describe("insertNewPackage", () => {
  test("Should return Success with Valid Data - 1 Version", async () => {
    const pack = require("./fixtures/git.createPackage_returns/valid_one_version.js");
    const obj = await database.insertNewPackage(pack);
    if (!obj.ok) console.log(obj);
    expect(obj.ok).toBeTruthy();
    expect(typeof obj.content === "string").toBeTruthy();
    // This endpoint only returns the pointer on success.
  });
  test("Should return success with valid data - Multi Version", async () => {
    const pack = require("./fixtures/git.createPackage_returns/valid_multi_version.js");
    const obj = await database.insertNewPackage(pack);
    if (!obj.ok) console.log(obj);
    expect(obj.ok).toBeTruthy();
    expect(typeof obj.content === "string").toBeTruthy();
    // this endpoint only returns a pointer on success
  });
});

describe("insertNewPackageName", () => {
  test("Should return Server Error for package that doesn't exist", async () => {
    const obj = await database.insertNewPackageName(
      "notARepo",
      "notARepo-Reborn"
    );
    expect(obj.ok).toBeFalsy();
    expect(obj.short).toEqual("Server Error");
  });
  test("Should return Success for valid package", async () => {
    const obj = await database.insertNewPackageName(
      "publish-test-valid-rename",
      "publish-test-valid"
    );
    expect(obj.ok).toBeTruthy();
    expect(obj.content).toEqual(
      "Successfully inserted publish-test-valid-rename."
    );
  });
});

describe("getTotalPackageEstimate", () => {
  test("Should return a successful Server Status Object", async () => {
    const obj = await database.getTotalPackageEstimate();
    expect(obj.ok).toBeTruthy();
  });
  test.failing("Should return an expected-ish value", async () => {
    const obj = await database.getTotalPackageEstimate();
    expect(obj.content).toBeGreaterThan(0);
    // This test is currently failing, seems in our dev environment that
    // the estimate returns 0 no matter what.
  });
});

describe("Package Lifecycle Tests", () => {
  // Below are what we will call lifecycle tests.
  // That is tests that will test multiple actions against the same package,
  // to ensure that the lifecycle of a package will be healthy.
  test("Package A Lifecycle", async () => {
    const pack = require("./fixtures/lifetime/package-a.js");

    // === Let's publish our package
    const publish = await database.insertNewPackage(pack.createPack);
    expect(publish.ok).toBeTruthy();
    expect(typeof publish.content === "string").toBeTruthy();
    // this endpoint only returns a pointer on success.

    // === Do we get all the right data back when asking for our package
    const getAfterPublish = await database.getPackageByName(
      pack.createPack.name
    );
    expect(getAfterPublish.ok).toBeTruthy();
    // then let's check some essential values
    expect(typeof getAfterPublish.content.pointer === "string").toBeTruthy();
    expect(getAfterPublish.content.name).toEqual(pack.createPack.name);
    expect(getAfterPublish.content.created).toBeDefined();
    expect(getAfterPublish.content.updated).toBeDefined();
    expect(getAfterPublish.content.creation_method).toEqual(
      pack.createPack.creation_method
    );
    expect(getAfterPublish.content.downloads).toEqual("0");
    expect(getAfterPublish.content.stargazers_count).toEqual("0");
    expect(getAfterPublish.content.original_stargazers).toEqual("0");
    expect(getAfterPublish.content.data.name).toEqual(pack.createPack.name);
    expect(getAfterPublish.content.data.readme).toEqual(pack.createPack.readme);
    expect(getAfterPublish.content.data.repository).toEqual(
      pack.createPack.repository
    );
    expect(getAfterPublish.content.data.metadata).toEqual(
      pack.createPack.metadata
    );
    expect(getAfterPublish.content.versions.length).toEqual(1); // Only 1 ver was provided
    expect(getAfterPublish.content.versions[0].semver).toEqual(
      pack.createPack.metadata.version
    );
    expect(getAfterPublish.content.versions[0].status).toEqual("latest");
    expect(getAfterPublish.content.versions[0].license).toEqual("NONE");
    expect(getAfterPublish.content.versions[0].package).toBeDefined();

    // === Can we publish a duplicate package?
    const dupPublish = await database.insertNewPackage(pack.createPack);
    expect(dupPublish.ok).toBeFalsy();

    // === Let's rename our package
    const NEW_NAME = "package-a-lifetime-rename";
    const newName = await database.insertNewPackageName(
      NEW_NAME,
      pack.createPack.name
    );
    expect(newName.ok).toBeTruthy();
    expect(newName.content).toEqual(`Successfully inserted ${NEW_NAME}.`);

    // === Can we get the package by it's new name?
    const getByNewName = await database.getPackageByName(NEW_NAME);
    expect(getByNewName.ok).toBeTruthy();
    expect(getByNewName.content.name).toEqual(NEW_NAME);
    expect(getByNewName.content.created).toBeDefined();
    expect(
      getByNewName.content.updated >= getAfterPublish.content.updated
    ).toBeTruthy();
    // For the above expect().getGreaterThan() doesn't support dates.

    // === Can we still get the package by it's old name?
    const getByOldName = await database.getPackageByName(pack.createPack.name);
    expect(getByOldName.ok).toBeTruthy();
    expect(getByOldName.content.name).toEqual(NEW_NAME);
    expect(getByOldName.content.created).toBeDefined();
    expect(
      getByOldName.content.updated >= getAfterPublish.content.updated
    ).toBeTruthy();

    // === Can we rename with an already used name?
    // This should fail because there's a unique constraint on names, not only
    // for the single package, but the entire table, i.e. two packages cannot
    // have the same name.
    const renameToExistingName = await database.insertNewPackageName(
      pack.createPack.name,
      NEW_NAME
    );
    expect(renameToExistingName.ok).toBeFalsy();
    expect(renameToExistingName.content).toEqual(
      `Unable to add the new name: ${pack.createPack.name} is already used.`
    );

    // === Now let's try to delete the only version available.
    // This should fail because the package needs to have at least
    // one published (latest) version.
    const removeOnlyVersion = await database.removePackageVersion(
      NEW_NAME,
      pack.createPack.metadata.version
    );
    expect(removeOnlyVersion.ok).toBeFalsy();
    expect(removeOnlyVersion.content).toEqual(
      `It's not possible to leave the ${NEW_NAME} without at least one published version`
    );

    // === Now let's add a version
    const v1_0_1 = pack.addVersion("1.0.1");
    const addNextVersion = await database.insertNewPackageVersion(v1_0_1);
    if (!addNextVersion.ok) {
      console.log(addNextVersion);
    }
    expect(addNextVersion.ok).toBeTruthy();
    expect(addNextVersion.content).toEqual(
      `Successfully added new version: ${v1_0_1.name}@${v1_0_1.version}`
    );

    // === Let's see if this new version is the latest
    // The versions are sorted from latest to oldest, so
    // index 0 is the latest, index 1 is the older.
    const getAfterVer = await database.getPackageByName(NEW_NAME);
    expect(getAfterVer.ok).toBeTruthy();
    expect(getAfterVer.content.versions.length).toEqual(2);
    expect(getAfterVer.content.versions[0].semver).toEqual(v1_0_1.version);
    expect(getAfterVer.content.versions[0].status).toEqual("latest");
    expect(getAfterVer.content.versions[0].license).toEqual(v1_0_1.license);
    expect(getAfterVer.content.versions[0].meta.name).toEqual(v1_0_1.name);
    expect(getAfterVer.content.versions[0].meta.version).toEqual(
      v1_0_1.version
    );
    expect(getAfterVer.content.versions[1].semver).toEqual(
      pack.createPack.metadata.version
    );

    // === Can we publish a duplicate or a lower version?
    const dupVer = await database.insertNewPackageVersion(v1_0_1);
    expect(dupVer.ok).toBeFalsy();
    expect(dupVer.content).toEqual(
      "Cannot publish a new version with semver lower or equal than the current latest one."
    );

    // === Can we get this specific version with the new name
    const getNewVerOnly = await database.getPackageVersionByNameAndVersion(
      NEW_NAME,
      v1_0_1.version
    );
    expect(getNewVerOnly.ok).toBeTruthy();
    expect(getNewVerOnly.content.status).toEqual("latest");
    expect(getNewVerOnly.content.semver).toEqual(v1_0_1.version);
    expect(getNewVerOnly.content.meta.name).toEqual(pack.createPack.name);

    // === Can we get the first verison published still?
    const getOldVerOnly = await database.getPackageVersionByNameAndVersion(
      NEW_NAME,
      pack.createPack.metadata.version
    );
    expect(getOldVerOnly.ok).toBeTruthy();
    expect(getOldVerOnly.content.status).toEqual("published");
    expect(getOldVerOnly.content.semver).toEqual(
      pack.createPack.metadata.version
    );
    expect(getOldVerOnly.content.meta.name).toEqual(pack.createPack.name);

    // === Can we star our package?
    const starPack = await database.updatePackageIncrementStarByName(NEW_NAME);
    expect(starPack.ok).toBeTruthy();
    expect(starPack.content.name).toEqual(NEW_NAME);
    expect(starPack.content.stargazers_count).toEqual("1");
    expect(starPack.content.original_stargazers).toEqual("0");

    // === Can we add a download to our package?
    const downPack = await database.updatePackageIncrementDownloadByName(
      NEW_NAME
    );
    expect(downPack.ok).toBeTruthy();
    expect(downPack.content.name).toEqual(NEW_NAME);
    expect(downPack.content.downloads).toEqual("1");

    // === Can we undownload our package?
    const downPackUndo = await database.updatePackageDecrementDownloadByName(
      NEW_NAME
    );
    expect(downPackUndo.ok).toBeTruthy();
    expect(downPackUndo.content.name).toEqual(NEW_NAME);
    expect(downPackUndo.content.downloads).toEqual("0");

    // === Can we unstar our package?
    const starPackUndo = await database.updatePackageDecrementStarByName(
      NEW_NAME
    );
    expect(starPackUndo.ok).toBeTruthy();
    expect(starPackUndo.content.name).toEqual(NEW_NAME);
    expect(starPackUndo.content.stargazers_count).toEqual("0");
    expect(starPackUndo.content.original_stargazers).toEqual("0");

    // === Can we star by the old name?
    const starPackOld = await database.updatePackageIncrementStarByName(
      pack.createPack.name
    );
    expect(starPackOld.ok).toBeTruthy();
    expect(starPackOld.content.name).toEqual(NEW_NAME);
    expect(starPackOld.content.stargazers_count).toEqual("1");

    // === Can we download by old name?
    const downPackOld = await database.updatePackageIncrementDownloadByName(
      pack.createPack.name
    );
    expect(downPackOld.ok).toBeTruthy();
    expect(downPackOld.content.name).toEqual(NEW_NAME);
    expect(downPackOld.content.downloads).toEqual("1");

    // === Can we delete our newest version?
    const delLatestVer = await database.removePackageVersion(
      NEW_NAME,
      v1_0_1.version
    );
    expect(delLatestVer.ok).toBeTruthy();
    expect(delLatestVer.content).toEqual(
      `Removed ${v1_0_1.version} of ${NEW_NAME} and ${pack.createPack.metadata.version} is the new latest version.`
    );

    // === Is our old version the latest again?
    const newLatestVer = await database.getPackageByName(NEW_NAME);
    expect(newLatestVer.ok).toBeTruthy();
    expect(newLatestVer.content.name).toEqual(NEW_NAME);
    expect(newLatestVer.content.versions.length).toEqual(1);
    expect(newLatestVer.content.versions[0].semver).toEqual(
      pack.createPack.metadata.version
    );
    expect(newLatestVer.content.versions[0].status).toEqual("latest");

    // === Can we reinsert a previous deleted version?
    // This is intentionally unsupported because we want a new package to be always
    // higher than the previous latest one in order to trigger an update to the user.
    const reAddNextVersion = await database.insertNewPackageVersion(v1_0_1);
    const latestVer = await database.getPackageByName(NEW_NAME);
    expect(reAddNextVersion.ok).toBeFalsy();
    expect(reAddNextVersion.content).toEqual(
      `Not allowed to publish a version previously deleted for ${v1_0_1.name}`
    );

    // === Can we delete a version lower than the current latest?
    // First let's push a new version.
    const newSemver = "1.1.0";
    const newVersion = pack.addVersion(newSemver);
    const addNewVersion = await database.insertNewPackageVersion(newVersion);
    expect(addNewVersion.ok).toBeTruthy();
    expect(addNewVersion.content).toEqual(
      `Successfully added new version: ${newVersion.name}@${newVersion.version}`
    );
    // Delete the oldest version.
    const removeOldestVersion = await database.removePackageVersion(
      NEW_NAME,
      pack.createPack.metadata.version
    );
    expect(removeOldestVersion.ok).toBeTruthy();
    expect(removeOldestVersion.content).toEqual(
      `Successfully removed ${pack.createPack.metadata.version} version of ${NEW_NAME} package.`
    );

    // === Can we remove a non-existing version?
    const removeNonExistingVersion = await database.removePackageVersion(
      NEW_NAME,
      pack.createPack.metadata.version
    );
    expect(removeNonExistingVersion.ok).toBeFalsy();
    expect(removeNonExistingVersion.content).toEqual(
      `There's no version ${pack.createPack.metadata.version} to remove for ${NEW_NAME} package`
    );

    // === Can we delete the entire package?
    const delPack = await database.removePackageByName(NEW_NAME);
    expect(delPack.ok).toBeTruthy();
    expect(delPack.content).toEqual(
      `Successfully Deleted Package: ${NEW_NAME}`
    );

    // === Can we get our now deleted package?
    const ghostPack = await database.getPackageByName(NEW_NAME);
    expect(ghostPack.ok).toBeFalsy();
    expect(ghostPack.short).toEqual("Not Found");
  });
  test("User A Lifecycle Test", async () => {
    const user = require("./fixtures/lifetime/user-a.js");

    // === Can we get our Non-Existant User?
    const noExistUser = await database.getUserByNodeID(user.userObj.node_id);
    expect(noExistUser.ok).toBeFalsy();
    expect(noExistUser.short).toEqual("Not Found");

    // === Can we create our User?
    const createUser = await database.insertNewUser(user.userObj);
    expect(createUser.ok).toBeTruthy();
    expect(createUser.content.username).toEqual(user.userObj.username);
    expect(createUser.content.node_id).toEqual(user.userObj.node_id);
    expect(createUser.content.avatar).toEqual(user.userObj.avatar);

    // === Can we get our user that now exists?
    const getUser = await database.getUserByNodeID(user.userObj.node_id);
    expect(getUser.ok).toBeTruthy();
    expect(getUser.content.username).toEqual(user.userObj.username);
    expect(getUser.content.node_id).toEqual(user.userObj.node_id);
    expect(getUser.content.avatar).toEqual(user.userObj.avatar);
    expect(getUser.content.created_at).toBeDefined();
    expect(getUser.content.data).toBeDefined();
    expect(getUser.content.id).toBeDefined();

    // === Can we get our user by name?
    const getUserName = await database.getUserByName(user.userObj.username);
    expect(getUserName.ok).toBeTruthy();
    expect(getUserName.content.username).toEqual(user.userObj.username);
    expect(getUserName.content.node_id).toEqual(user.userObj.node_id);
    expect(getUserName.content.avatar).toEqual(user.userObj.avatar);
    expect(getUserName.content.created_at).toBeDefined();
    expect(getUserName.content.data).toBeDefined();
    expect(getUserName.content.id).toBeDefined();

    const USER_ID = getUserName.content.id;

    // === Can we get our user by Id?
    const getUserID = await database.getUserByID(USER_ID);
    expect(getUserID.ok).toBeTruthy();
    expect(getUserID.content.username).toEqual(user.userObj.username);
    expect(getUserID.content.node_id).toEqual(user.userObj.node_id);
    expect(getUserID.content.avatar).toEqual(user.userObj.avatar);
    expect(getUserID.content.created_at).toBeDefined();
    expect(getUserID.content.data).toBeDefined();
    expect(getUserID.content.id).toBeDefined();

    // === Can we get our user in a collection?
    const getUserIDCol = await database.getUserCollectionById([USER_ID]);
    expect(getUserIDCol.ok).toBeTruthy();
    expect(getUserIDCol.content.length).toEqual(1);
    expect(getUserIDCol.content[0].login).toEqual(user.userObj.username);

    // === Does our user have any fake stars?
    const getFakeStars = await database.getStarredPointersByUserID(USER_ID);
    expect(getFakeStars.ok).toBeTruthy();
    expect(getFakeStars.content.length).toEqual(0);

    // === Can we star a package with our User?
    const starPack = await database.updateStars(
      getUserID.content,
      "language-css"
    );
    expect(starPack.ok).toBeTruthy();
    expect(starPack.content.startsWith("Successfully Stared ")).toBeTruthy();
    expect(starPack.content.endsWith(` with ${USER_ID}`)).toBeTruthy();

    // === Does our user now have valid stars?
    const getStars = await database.getStarredPointersByUserID(USER_ID);
    expect(getStars.ok).toBeTruthy();
    expect(getStars.content.length).toEqual(1);

    // === Can we remove our star?
    const remStar = await database.updateDeleteStar(
      getUserID.content,
      "language-css"
    );
    expect(remStar.ok).toBeTruthy();
    expect(remStar.content.startsWith("Successfully Unstarred ")).toBeTruthy();
    expect(remStar.content.endsWith(` with ${USER_ID}`)).toBeTruthy();

    // === Can we remove our User?
    // TODO: Currently there is no way to delete a user account.
    // There is no supported endpoint for this, but is something that should be implemented.
  });
});
